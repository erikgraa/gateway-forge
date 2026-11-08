export type HashAlg = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

/** Extract DER bytes from a PEM bundle (first certificate), a bare base64 blob, or raw DER bytes. */
export function certToDer(input: string | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) {
    // PEM text uploaded as a file is also a Uint8Array; detect the armor.
    const head = new TextDecoder().decode(input.slice(0, 40));
    if (head.includes('-----BEGIN')) return certToDer(new TextDecoder().decode(input));
    return input;
  }
  const m = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/.exec(input);
  const b64 = (m ? m[1] : input).replace(/\s+/g, '');
  if (!b64 || !/^[A-Za-z0-9+/]+=*$/.test(b64)) throw new Error('Not a PEM/base64 certificate.');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  // X.509 certificates are a DER SEQUENCE (0x30).
  if (out[0] !== 0x30) throw new Error('Decoded data is not a DER certificate.');
  return out;
}

export function toColonHex(bytes: Uint8Array, upper = true): string {
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'));
  const s = hex.join(':');
  return upper ? s.toUpperCase() : s;
}

export async function hashDer(der: Uint8Array, alg: HashAlg): Promise<Uint8Array> {
  const copy = new Uint8Array(der);
  return new Uint8Array(await crypto.subtle.digest(alg, copy.buffer));
}

export const ALG_PREFIX: Record<HashAlg, string> = {
  'SHA-1': 'sha1',
  'SHA-256': 'sha256',
  'SHA-384': 'sha384',
  'SHA-512': 'sha512'
};

export interface ThumbprintSet {
  'SHA-1': string;
  'SHA-256': string;
  'SHA-384': string;
  'SHA-512': string;
}

/** Colon-separated hex fingerprints of a certificate, computed locally with WebCrypto. */
export async function thumbprints(input: string | Uint8Array): Promise<ThumbprintSet> {
  const der = certToDer(input);
  const algs: HashAlg[] = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
  const res = await Promise.all(algs.map(async (a) => toColonHex(await hashDer(der, a))));
  return { 'SHA-1': res[0], 'SHA-256': res[1], 'SHA-384': res[2], 'SHA-512': res[3] };
}

/** Format as UAG expects: [alg=]xx:xx:... */
export function uagThumbprint(set: ThumbprintSet, alg: HashAlg = 'SHA-256'): string {
  return `${ALG_PREFIX[alg]}=${set[alg].toLowerCase()}`;
}

/** PowerShell one-liner that prints the Connection Server certificate thumbprints. */
export function powershellThumbprintCommand(hostPort: string): string {
  const [host, port = '443'] = hostPort.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').split(':');
  const h = host.replace(/'/g, "''");
  return [
    `$h='${h}';$p=${Number(port) || 443};`,
    `$t=New-Object Net.Sockets.TcpClient($h,$p);`,
    `$s=New-Object Net.Security.SslStream($t.GetStream(),$false,{$true});`,
    `$s.AuthenticateAsClient($h);`,
    `$d=([Security.Cryptography.X509Certificates.X509Certificate2]$s.RemoteCertificate).RawData;`,
    `$s.Dispose();$t.Dispose();`,
    `'sha1','sha256','sha384','sha512'|%{ "$_="+((([Security.Cryptography.HashAlgorithm]::Create($_)).ComputeHash($d)|%{$_.ToString('x2')}) -join ':') }`
  ].join('');
}

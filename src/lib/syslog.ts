import type { Primitive, Values } from './schema';

export function syslogDestination(values: Values): { server: string; port: Primitive } {
  const raw = String(values.syslogUrl ?? '');
  const match = /^(\[[^\]]+\]|[^:]+):([^:]*)$/.exec(raw);
  return {
    server: match?.[1] ?? raw,
    port: values.syslogPort ?? match?.[2] ?? (values.sysLogType === 'UDP' ? 514 : values.sysLogType === 'MQTT' ? 1883 : 6514)
  };
}

export function setSyslogServer(values: Values, server: string): void {
  const previous = syslogDestination(values);
  const embedded = /^(\[[^\]]+\]|[^:]+):([^:]*)$/.test(server);
  if (embedded) delete values.syslogPort;
  else if (values.syslogPort === undefined && previous.server !== String(values.syslogUrl ?? '')) values.syslogPort = previous.port;
  values.syslogUrl = server;
}

export function syslogUrl(values: Values): string {
  const raw = String(values.syslogUrl ?? '');
  const { server, port } = syslogDestination(values);
  if (!server) return '';
  // Preserve imported spelling until the operator changes its port.
  if (values.syslogPort === undefined && server !== raw) return raw;
  const host = server.includes(':') && !server.startsWith('[') ? `[${server}]` : server;
  return `${host}:${port}`;
}

import './app.css';
import './workspace.css';
import { mount } from 'svelte';
import App from './ScenarioApp.svelte';
import './scenario-workspace.css';
import './appearance.css';

const app = mount(App, { target: document.getElementById('app')! });

export default app;

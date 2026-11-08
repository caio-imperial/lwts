// Settings page modules, split by domain for the 500-line gate.
// Import order matters: cross-module calls go through the window globals
// each module publishes at the end of its file.
import './settings-confirm.js';
import './settings-user-modal.js';
import './settings-appearance.js';
import './settings-shell.js';
import './settings-general.js';
import './settings-notifications.js';
import './settings-team.js';
import './settings-data.js';
import './settings-boards.js';
import './settings-custom-fields.js';
import './settings-columns.js';
import './settings-automation.js';
import './settings-integrations.js';

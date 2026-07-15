# Install the Codex adapter

Use the complete `dist/` release. The Codex adapter is one component of that release, not a separate product.

1. Install the release package so the self-contained `pm` CLI is on `PATH`:

   ```text
   npm install --global <absolute-path-to-dist>
   pm --version
   ```

2. Add the bundled local marketplace:

   ```text
   codex plugin marketplace add <absolute-path-to-dist>/adapters/codex
   codex plugin marketplace list
   ```

3. Restart the ChatGPT desktop app, open the plugin directory, choose **AI Project Manager Local**, and install **AI Project Manager**.
4. Start a new task in the managed repository and invoke `$ai-project-manager`, or ask Codex to start or resume the project Change.
5. Confirm that exactly one `ai-project-manager` Skill is available and that `pm status --json` runs in the repository.

The plugin contains the projected core Skill. It does not add a second workflow, Hook, MCP server, persistent service, or alternate state store. If the Skill does not appear after installation, restart Codex and recheck the marketplace and plugin enabled state.

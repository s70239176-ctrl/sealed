# CI templates

Copy these into `.github/workflows/` to enable CI and the GitHub Pages deploy. They live here because publishing a
workflow needs a token with the `workflow` scope: run `gh auth refresh -h github.com -s workflow`, then
`mkdir -p .github && git mv ci .github/workflows`.

- `ci.yml`: lints the contract, runs the Direct Mode tests (add `-p windows_direct_plugin` only on Windows), then
  typechecks, tests and builds the web app.
- `pages.yml`: builds the web app and publishes it to GitHub Pages. Set the repository variable `SEALED_CONTRACT` to the
  deployed contract address. The app uses hash routing and relative assets, so it works from a project URL.
- `web/vercel.json` is the equivalent for Vercel (set `VITE_CONTRACT_ADDRESS` in the project's environment).

Nothing here has been run on GitHub yet: this repo has no remote.

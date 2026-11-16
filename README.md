# Set Designer

Photograph your props, measure them from a bank card in the shot, and get three room-set designs with lighting plans and photo mockups.

## Run locally

    npm install
    npm start

Open http://localhost:4810. The terminal also prints an address for phones on the same Wi-Fi.

Designs come from built-in rules. To use Claude instead, copy `.env.example` to `.env` and add an Anthropic API key (local server only; this path is untested).

## Publish the static site

    SD_PASSCODE='team passcode' npm run deploy

This builds `dist/` and pushes it to the `gh-pages` branch. The passcode gate runs in the browser and only keeps casual visitors out.

# Set Designer

Photograph your props and products, tap each one's height (the app finds the item in the photo), and get three set designs with lighting plans and sample frames from each camera angle.

- **Props** carry a category, material and status. Only available props are used in a design. A repeat photo of a prop you already have is offered as a match instead of being saved twice.
- **Products** are shown as their real photo. Several can be featured in one set; the first one picked is the main product.
- **Sample frames** show the same set from each standard angle, with where to stand the camera.

## Run locally

    npm install
    npm start
    npm test

Open http://localhost:4810. The terminal also prints an address for phones on the same Wi-Fi.

Designs come from built-in rules. To use Claude instead, copy `.env.example` to `.env` and add an Anthropic API key (local server only; this path is untested).

## Publish the static site

    SD_PASSCODE='team passcode' npm run deploy

This builds `dist/` and pushes it to the `gh-pages` branch. The passcode gate runs in the browser and only keeps casual visitors out.

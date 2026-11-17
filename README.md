# Set Designer

Photograph your props and products, tap each one's height (the app finds the item in the photo), and get three set designs with lighting plans and sample frames from each camera angle. The **Shoots** screen connects to the BTY B-Roll Tracker sheet for this week's shoots, shot reports and moodboards.

- **Props** carry a category, material and status. Only available props are used in a design. A repeat photo of a prop you already have is offered as a match instead of being saved twice.
- **Products** are shown as their real photo. Several can be featured in one set; the first one picked is the main product.
- **Sample frames** show the same set from each standard angle, with where to stand the camera. Any frame can be pinned to a shoot's moodboard.
- **Shoots** (bookmark `…/set-designer/#shoots`) shows the week's shoots from SHOOT PLAN:
  - weekly target vs captured for Internal (Massive + CBQ), Massive, CBQ and External, with how many clips are still needed and how many more need planning
  - each shoot with its crew: planned, captured, QC passed and clips left per person
  - **Report shots** writes Captured Clips, QC Passed Clips and Shoot Status into that person's SHOOT PLAN row
  - a **moodboard** per shoot (same date, product and time block): the team uploads pegs, everyone on that shoot sees them. Photos live in a Drive folder; its link goes into Moodboard / Reference Link when that cell is empty.

## Run locally

    npm install
    npm start
    npm test

Open http://localhost:4810. The terminal also prints an address for phones on the same Wi-Fi.

Designs come from built-in rules. To use Claude instead, copy `.env.example` to `.env` and add an Anthropic API key (local server only; this path is untested).

To try the Shoots screen without touching the real tracker:

    npm run mock

Open http://localhost:4811/#shoots and use the passcode `team-pass`. The data is pretend and resets when you stop the script.

## Connect the B-roll tracker (once)

The app talks to the tracker through a small script attached to the sheet. It runs as the sheet owner, so the team does not need edit access to the sheet to report shots.

1. Open the BTY B-Roll Tracker. **Extensions → Apps Script**.
2. Add a file (**+ → Script**), name it `SetDesigner`, and paste in everything from `apps-script/Code.gs`. Save.
   - If the project already has a function called `onOpen`, rename the one in `SetDesigner` to `sdOnOpen` and call `sdOnOpen()` from the existing one.
   - If it already has `doGet` or `doPost` (it is already a web app), stop and merge by hand: two functions with the same name override each other.
3. **Deploy → New deployment → Web app**. Execute as: **Me**. Who has access: **Anyone**. Deploy and allow the permissions it asks for (Sheets and Drive).
4. Copy the **Web app URL** (ends in `/exec`).
5. Reload the sheet. In the new **Set Designer** menu choose **Set team passcode…** and enter the same passcode the team uses to open the app.
6. Publish the app with the link built in:

       SD_PASSCODE='team passcode' SD_TRACKER_URL='https://script.google.com/macros/s/…/exec' npm run deploy

After a code change to `Code.gs`, use **Deploy → Manage deployments → Edit → New version** so the URL stays the same.

What the script touches: in SHOOT PLAN only Captured Clips, QC Passed Clips, Shoot Status, and Moodboard / Reference Link (only when empty). It never writes the (Auto) columns, RAW Folder Link or RAW REVIEW. Pegs go in a `BTY B-Roll Moodboards` folder next to the sheet, one subfolder per shoot, shared as view-only by link. The team passcode is the only key, so change it from the sheet menu if it leaks.

## Publish the static site

    SD_PASSCODE='team passcode' SD_TRACKER_URL='https://script.google.com/macros/s/…/exec' npm run deploy

This builds `dist/` and pushes it to the `gh-pages` branch. The passcode gate runs in the browser and only keeps casual visitors out. Without `SD_TRACKER_URL`, each person pastes the tracker link once on the Shoots screen.

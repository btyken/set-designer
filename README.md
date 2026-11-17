# B-roll Production Tools

Two tools for BTY B-roll production in one app:

- **Set Designer** (default page): photograph props and products, describe the set, and get three set designs with lighting plans and sample frames from each camera angle.
- **Shoot Dashboard** (bookmark `…/#shoots`): the week's shoots from the BTY B-Roll Tracker sheet, clips needed against each shoot's target, shot reports, and a moodboard per shoot.

Switch between them with the buttons in the header.

### Set Designer

- **Props** carry a category, material and status. Only available props are used in a design. A repeat photo of a prop you already have is offered as a match instead of being saved twice.
- **Products** are shown as their real photo. Several can be featured in one set; the first one picked is the main product.
- **Sample frames** show the same set from each standard angle, with where to stand the camera. Any frame can be pinned to a shoot's moodboard.

Props, products and designs are saved in each browser.

### Shoot Dashboard

- A **shoot** is the SHOOT PLAN rows with the same date, product and time block.
- **Targets are per shoot.** The stream targets on OVERVIEW (Internal - Massive, Internal - CBQ, External) apply to each shoot that has people in that stream. A shoot card shows each stream's target, clips captured, how many more are needed, and whether the plan is short of the target. Rows with no Video Stream have no target until one is set.
- The week cards add up the targets of all shoots in the week. Clips needed are counted shoot by shoot, so extra clips on one shoot do not cover another.
- **Team quotas**: each person's clips captured against their Planned Clips (e.g. 0 / 75), with how many are still to go.
- Earlier shoots that are still short of their planned clips (and not Completed or Paused) are carried into the current week under **Still open from earlier weeks**, and count in the quotas.
- Each person's row shows captured / quota and QC-passed clips. **Report shots** writes Captured Clips, QC Passed Clips and Shoot Status into that person's SHOOT PLAN row. Video Stream can be picked right on the row; it is saved to column S.
- The **Moodboard** page collects every inspo photo for the week in one Pinterest-style board, filterable by shoot. Drop or pick photos to add them to a shoot's board, or to General inspo when they are not for one shoot. Each shoot card also shows its own photos.
- Photos live in Drive, one folder per shoot. A shoot folder's link goes into Moodboard / Reference Link when that cell is empty.

### Code layout

    public/
      main.js              starts both tools, header tool switch, #shoots address
      shared/              dom helpers, passcode gate, picture viewer
      set-designer/        app.js (screens), measure.js, props.js, rules.js (designs), scene.js (3D)
      shoot-dashboard/     dashboard.js (screens), tracker.js (targets maths + tracker calls)
      css/                 base.css, set-designer.css, shoot-dashboard.css
    apps-script/Code.gs    runs inside the tracker sheet (app bridge)
    apps-script/Catalog.gs same project: approved RAW folders → affiliate RAW CATALOG
    server.js              local server (and the optional Claude design path)

## Run locally

    npm install
    npm start
    npm test

Open http://localhost:4810. The terminal also prints an address for phones on the same Wi-Fi.

Designs come from built-in rules. To use Claude instead, copy `.env.example` to `.env` and add an Anthropic API key (local server only; this path is untested).

To try the Shoot Dashboard without touching the real tracker:

    npm run mock

Open http://localhost:4811/#shoots and use the passcode `team-pass`. The data is pretend and resets when you stop the script.

## Connect the B-roll tracker (once)

The app talks to the tracker through a small script attached to the sheet. It runs as the sheet owner, so the team does not need edit access to the sheet to report shots.

1. Open the BTY B-Roll Tracker. **Extensions → Apps Script**.
2. Add a file (**+ → Script**), name it `BrollTools`, and paste in everything from `apps-script/Code.gs`. Save.
   - If the project already has a function called `onOpen`, rename the one in `BrollTools` to `sdOnOpen` and call `sdOnOpen()` from the existing one.
   - If it already has `doGet` or `doPost` (it is already a web app), stop and merge by hand: two functions with the same name override each other.
3. **Deploy → New deployment → Web app**. Execute as: **Me**. Who has access: **Anyone**. Deploy and allow the permissions it asks for (Sheets and Drive).
4. Copy the **Web app URL** (ends in `/exec`).
5. Reload the sheet. In the new **B-roll Tools** menu choose **Set team passcode…** and enter the same passcode the team uses to open the app.
6. Publish the app with the link built in:

       SD_PASSCODE='team passcode' SD_TRACKER_URL='https://script.google.com/macros/s/…/exec' npm run deploy

After a code change to `Code.gs`, use **Deploy → Manage deployments → Edit → New version** so the URL stays the same.

What the script touches: in SHOOT PLAN only Captured Clips, QC Passed Clips, Shoot Status, Video Stream, and Moodboard / Reference Link (only when empty). It never writes the (Auto) columns, RAW Folder Link or RAW REVIEW. Pegs go in a `BTY B-Roll Moodboards` folder next to the sheet, one subfolder per shoot, shared as view-only by link. The team passcode is the only key, so change it from the sheet menu if it leaks.

## Send approved RAW to the affiliate RAW CATALOG

`apps-script/Catalog.gs` links RAW REVIEW in this tracker to RAW CATALOG in the **External Affiliate RAW Content Distribution System** sheet.

- It picks clips with QC Result **Pass** and Brand Approval **Approved**, groups them by RAW folder (RAW Folder Link (Auto), else the shoot's RAW Folder Link in SHOOT PLAN), and adds one RAW CATALOG row per folder that is not there yet (matched by Drive folder ID, so hand-typed rows count).
- Each new row gets the next RAW-### ID, category `BTY B-ROLLS (VIDEO)`, folder label from Content Type, shoot date, folder link, description with the clip count, BTY Product Tag, and a note with the Shoot IDs. Share Status is **Needs Review**: a coordinator still marks it Ready.
- It only adds rows after the last filled one. It never edits or deletes catalog rows and never writes columns N–R. If the catalog's A–M headers move, it stops without writing.

Set up (once, in the same Apps Script project as Code.gs):

1. **+ → Script**, name it `Catalog`, paste in everything from `apps-script/Catalog.gs`. Also paste the updated `Code.gs` (it adds the menu items). Save.
2. Reload the tracker. **B-roll Tools → Preview RAW CATALOG additions** and allow the new permission (it opens the distribution sheet). Nothing is written by Preview.
3. **B-roll Tools → Turn on hourly RAW CATALOG link**. **Send approved RAW to RAW CATALOG now** runs it at once.

To point it at another sheet, set the script property `CATALOG_SHEET_ID`.

## Publish the static site

    SD_PASSCODE='team passcode' SD_TRACKER_URL='https://script.google.com/macros/s/…/exec' npm run deploy

This builds `dist/` and pushes it to the `gh-pages` branch. The passcode gate runs in the browser and only keeps casual visitors out. Without `SD_TRACKER_URL`, each person pastes the tracker link once on the Shoot Dashboard. `SD_PASS_HASH` can stand in for `SD_PASSCODE` to keep the passcode already published.

# Templates

Each entry is a whole Exact app to start from. Its folder's `TEMPLATE.md` says what it shows and where, with screenshots; `bun new.mjs <name> <path> --name <name> --bundle-id <id>` makes an app from it.

## chat

A chat app: a list of conversations, a transcript that follows its newest message, and a composer on the keyboard. Saved on the device.

Keywords: chat, messaging, messenger, conversation, inbox, transcript, bubbles, composer, keyboard, typing indicator, read receipt, reply, context menu, peek, popover, Liquid Glass, split view, sidebar, drafts, local persistence.

Hosts verified: web; iOS 27 on iPhone, iPad and iPhone Duo. Built on Exact `ad181418b3` (`chat/exact.json`).

## landscapes

A gallery of the world's landmarks, ported from Apple's sample "Landmarks: Building an app with Liquid Glass": a sidebar of Landmarks, Map and Collections, a landmark's page with an Info inspector, and collections to make and edit. Its photos come from Apple: `scripts/fetch-images.sh` fetches them, and every build runs it first (`before_build`).

Keywords: landmarks, places, travel, gallery, photos, featured hero, background extension, map, MapKit, collections, favorites, sidebar, split view, inspector, segmented control, cards in a row that scrolls sideways, grid, long-press menu, share, badges, edit mode, Liquid Glass, foldable, iPhone Duo, port of an Apple sample.

Hosts verified: iOS 27.1 on the iPhone Duo, open and closed (1 of 4 tests passes; see `TEMPLATE.md`). Built on Exact `f9744dd955` (`landscapes/exact.json`).

## softwear

A clothing store with a searchable catalogue, product photos and pinch zoom, inventory-aware bag, promo codes, checkout and accounts. Its backend is a Quickback project (`softwear/backend`): a Cloudflare Worker with D1 and Better Auth that serves the web and installed apps.

Keywords: store, shop, shopping, ecommerce, clothing, apparel, catalogue, catalog, product, inventory, stock, size, colour, filters, search, bag, cart, checkout, promo code, account, sign-in, password, bearer token, orders, favorites, photo gallery, pinch zoom, native module, REST, backend, Quickback, Cloudflare Workers, D1, Better Auth, server rendering, tabs.

Hosts tested: web (30 UI tests pass) and iOS 27 on an iPhone simulator (6 UI tests pass), both against the backend, and macOS by a driven order; `softwear/TEMPLATE.md` says what was not run. Built on Exact `1cbce180d4` (`softwear/exact.json`).

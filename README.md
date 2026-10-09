# Greens Greens – online shop prototype

Replaces the weekly Excel order sheet with a shop: browse, add to cart, pay by M-Pesa, owner admin.

## Run it
```
node tools/serve.js 5180      # then open http://localhost:5180
```
Staff page: http://localhost:5180/#admin (prototype PIN `1234`, checked in the browser only – a real login needs the backend). The staff page does one thing: sign in, upload this week's spreadsheet, check the summary, Save. Orders arrive by email, so there is no orders/clients/prices/settings admin any more.

## What is real vs simulated
- Real: catalogue (all 308 rows of the sheet, merged into 258 products), cart maths, estimate pricing for weighed items, checkout validation, order list, pick list, price/stock editing, delivery areas and the fixed delivery schedule.
- Simulated: the M-Pesa prompt (auto-succeeds after 6s, with buttons to simulate cancel/timeout) and "database" (browser localStorage – each device has its own copy).
- Delivery day is set by the client's GROUP, not chosen by the customer: he sends the sheet to the Monday group (delivered Wed), Tuesday group (Thu), Thursday group (Sat). Customers are matched by M-Pesa phone number against the Clients list (admin → Clients, paste/import supported); each group also has a link (`?g=mon|tue|thu`) he can send instead of the Excel. Unknown numbers get "we'll confirm" and show up in admin as "Not on a client group yet" to assign in one click.
- Placeholder: delivery area fees, photos (emoji tiles), estimated weights per piece/bunch.

## Refresh the catalogue from the owner's Excel
```
python3 -I tools/build_catalogue.py "/path/to/Greens Greens List.xls"   # needs: pip install xlrd
```

## Photos
Drop `images/<slug>.jpg` (e.g. `images/avocado.jpg`) – slug is the product name lowercased with dashes – then re-run the catalogue script. Products without a photo show an emoji tile.

## Weekly stock + price update (built)
New rows on the uploaded sheet (a name and a price, not already in the shop) are ADDED as new products after the staff member confirms the summary: category guessed from the sheet's Group/name, units from Order Unit/Charge Unit (piece/bunch/pack priced per kg gets an estimated weight of 0.25 kg, editable only in code for now), shown on a category tile until a photo is added. Rows with no price are listed but not added. Undo removes them again.
Admin → Weekly update: upload this week's sheet (.xls/.xlsx/.csv, same layout as the order sheet; matched by ItemID, falling back to the exact item name). Items on the sheet = in stock; items not on it = "Not available this week" (per option, e.g. tomatoes by piece can be in while by kg is out); prices on the sheet replace shop prices. Shows a check-before-apply summary (price changes, newly out, back in, unmatched rows), blocks a likely wrong file (<20% matched) unless confirmed, and has Undo. The shop banner shows when it was last updated. "Download the current list (Excel)" exports the current list to edit and re-upload. Spreadsheet reading uses SheetJS from cdnjs (needs internet).
Caveat: the state is saved in the admin's browser; for customers on other devices to see it, the update must be stored on a server (same backend as orders).

## Order email (built)
Checkout POSTs the order to `/api/order`; `server/orderEmail.js` emails it to Greens Greens (and a copy to the customer). Locally `tools/serve.js` handles the route and writes the emails to `outbox/` (open them in a browser to preview). Hosted: `netlify/functions/order.js` + `netlify.toml`. Env vars: `ORDER_TO`, `ORDER_FROM`, `RESEND_API_KEY`, `SEND_CUSTOMER_COPY` (see top of `server/orderEmail.js`). If sending fails the customer can retry or use a prefilled "send by email instead" link.
Note: with email only, the admin page shows just the orders placed on that device; the owner's inbox is the master list until a database is added.

## To go live (not built yet)
1. Backend + database for orders, prices, stock (so every customer and the owner see the same data).
2. Safaricom Daraja STK Push (Lipa na M-Pesa Online) with the owner's Paybill/Till: server sends the push, M-Pesa calls back, order is marked paid. Keys stay server-side.
3. Real staff login; order notification to the owner (email/WhatsApp); hosting + domain.
4. Settlement of weighed items (charge/refund the difference).

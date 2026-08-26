# HappyMed Pharmacy — User Manual

**How to use the stock system. Written for everyone, not just computer people.**

If you only have five minutes, read the [quick guide](staff-guide.md) instead.
This is the full version.

---

## Contents

- [What this system is for](#what-this-system-is-for)
- [Getting in](#getting-in)
- [Words we use](#words-we-use)
- [Part 1 — Everyone](#part-1--everyone)
- [Part 2 — Pharmacist](#part-2--pharmacist)
- [Part 3 — Owner](#part-3--owner)
- [I want to… (quick index)](#i-want-to)
- [When something goes wrong](#when-something-goes-wrong)

---

## What this system is for

It keeps track of **what medicine you have, where it came from, and when it expires.**

The important part is the expiry tracking. The same medicine sits on your shelf in
several different boxes, bought at different times, expiring on different dates.
This system knows the difference — so it can always tell you **which box to sell first**.

### The one thing to understand

**The system never rubs anything out. It only ever adds a new line.**

When you give out 10 tablets, it doesn't change 500 into 490. It writes a permanent
note saying *"10 tablets out, lot PAR2405B, by Maria, 3:42pm"* — and the 490 is
worked out from every note ever written.

That means:

- Nothing can be lost or quietly changed
- Every number can be traced back to who did what
- A mistake is fixed by **adding a correction**, never by erasing

---

## Getting in

### The address

```
happymed.vercel.app
```

Type it into Chrome or Safari like any website. **Bookmark it** so you never type it again.
Works on a phone, tablet or the counter computer.

### Signing in

1. Open the address.
2. Type **your own** email address. The owner gave it to you.
3. Type your password.
4. Tap **Sign in**.

The first time, it asks you to choose your own password. Pick something you'll
remember — at least 10 characters.

### Staying in, and getting out

You stay signed in for about a week. On a shared counter computer, tap your name at
the top right and choose **Sign out** when you finish your shift.

### Changing your password

Tap your name (top right) → **Change password**. Do this any time you think someone
else might know it.

### Forgotten your password?

Only the owner can reset it. There's no "forgot password" email.

---

## Words we use

| Word | What it means |
| --- | --- |
| **Product** | A medicine you sell. "Paracetamol 500mg, Biogesic." |
| **Batch** or **Lot** | One actual box you received, with its own expiry date. |
| **Lot number** | The code printed on the box, e.g. `PAR2405B`. Identifies that specific box. |
| **Base unit** | The smallest piece you can sell — a tablet, a mL, a sachet. |
| **Pack** | How it's boxed — a box of 100 tablets. |
| **Dispense** | Giving medicine to a customer. |
| **Receive** | Taking a delivery in. |
| **Movement** | One line in the permanent log. |
| **Reorder point** | The level at which the system warns you to buy more. |

### Products vs Stock on hand — the confusing one

Think **menu versus fridge**.

**Products** is the list of medicines you sell. One row per medicine. It exists
even if you have none left.

**Stock on hand** is the actual boxes. One row per box, each with its own lot
number and expiry date.

One product row (800 tablets of Paracetamol) might be three rows in Stock on hand
— three boxes expiring on three different dates. **They are not interchangeable.**
One of them needs selling now.

---

## Part 1 — Everyone

*Counter staff, pharmacists and the owner can all do everything in this section.*

### Reading the colours

| Colour | Meaning | What to do |
| --- | --- | --- |
| 🟢 **Green** | Fine | Nothing. Plenty of time. |
| 🟠 **Orange** | Expiring soon | Sell this one first. Don't order more yet. |
| 🔴 **Red** | Expired or nearly | Off the shelf now. Tell the pharmacist. |

Same colours everywhere, so you can read a whole screen without reading any dates.

### Checking the Dashboard

**Do this at the start of every shift.**

Tap **Dashboard**. Four numbers at the top:

- **Expiring soon** — medicine to push
- **Expired on shelf** — medicine you must remove **today**
- **Low or out of stock** — things to reorder
- **Stock value** — money sitting on the shelves

**If "Expired on shelf" is anything but zero, deal with it before doing anything else.**
That's medicine a customer could buy right now and shouldn't.

### Finding out if you have something

Tap **Stock on hand** → type the name in the search box at the top.

It shows every box you have of it, with quantities and expiry dates. Faster than
walking to the shelf.

### Giving medicine to a customer

Tap **Dispense**.

1. Start typing the medicine name. Pick it from the list that appears.
2. Enter how many. **Two boxes:** whole packs, and loose pieces from an opened pack.
   - 2 boxes → put `2` in packs
   - 30 loose tablets → put `30` in loose
   - Both → fill in both
3. **The screen now tells you which lot number to take off the shelf.** Take that
   exact box.
4. Tap **Dispense**.

> ⚠️ **Take the box it tells you — not the one at the front of the shelf.**
> It picks the one expiring soonest, so stock gets used instead of thrown away.
> This is the most important habit in this manual.

**Reference box** — put the prescription or receipt number here if there is one.
Leave it empty if not.

**If it says you don't have enough:** stop. Don't reduce the number to make it fit.
Tell the pharmacist — it usually means a delivery wasn't recorded.

### Checking what's expiring

Tap **Expiry alerts**. Four buttons: **All · Expired · Critical · Warning**.

- **Warning** (orange) — your weekly job. Move these to the front of the shelf.
- **Expired** (red) — off the shelf immediately.

The list looks after itself. Nobody marks anything as expiring — the system works
it out from today's date every time you open it.

---

## Part 2 — Pharmacist

*Everything above, plus this section. Counter staff cannot do these.*

### Taking in a delivery

**Do this before the boxes go on the shelf.** Not later, not at closing.

**If you placed a purchase order for it:**

1. **Purchase orders** → open the order
2. Find the medicine's row in the table
3. Tap **Receive** on the right of that row
4. Fill in the box that opens

**If there's no order behind it** (a top-up, a transfer, first-time stock):

1. **Receive stock** in the menu
2. Pick the medicine

Either way, you enter:

| Field | What to put |
| --- | --- |
| **Lot number** | ⚠️ Copy from the **actual box**, not the invoice |
| **Expiry date** | ⚠️ Also from the actual box |
| **Packs / Loose** | How many arrived |
| **Cost per unit** | ⚠️ Per **tablet**, not per box — see below |

> ⚠️ **Cost is per single piece.** A box of 100 tablets costing ₱180 means you
> enter **1.80**, not 180. Check the line total looks like what you're paying.

**Two lots in one delivery?** Record them separately — one entry each. They have
different expiry dates, and keeping them apart is the whole point.

**If it refuses,** saying the lot already exists with a different expiry date:
one of the two was mistyped. Go and look at the box again. Don't force it.

### Ordering from a supplier

**Purchase orders** → **New order**

1. Choose the **supplier**
2. Set the **expected delivery** date
3. **Add a product**, then fill in packs, loose and cost per unit
4. Repeat for each medicine
5. **Save**

The order starts as **Draft** — still yours to edit. Once you've actually phoned or
emailed the supplier, open it and mark it **Submitted**.

**When it arrives,** receive against it (above). If only part arrives, record what
came — the order stays open showing what's still owed, and closes itself when
everything's in.

**If the rest is never coming,** mark the order **Cancelled**. What you received stays.

### Correcting a wrong number

**Stock on hand** → find the row → tap the **⋯** menu → **Adjust lot**.

Choose the direction (more or less), the amount, and **write a real reason**.
"Physical count 12 Mar, found 3 extra" — not "fix".

That reason appears in the audit log with your name for ever. That's what makes a
stock count worth anything.

### Throwing expired stock away

**Stock on hand** → **⋯** → **Dispose of lot**.

Do this rather than just binning it. It records the loss, and the owner's wastage
report shows what expiry is actually costing the pharmacy.

### Sending stock back

**Stock on hand** → **⋯** → **Return lot**. For stock going back to the supplier.

### Blocking a box without deleting it

**Stock on hand** → **⋯** → **Quarantine**.

Use this when something is wrong with a box — damaged, recalled, or you're unsure.
It stops anyone dispensing from it, but keeps every record intact. Reversible.

### Adding a new medicine

**Products** → **New product**.

The field that matters most:

> **Units per pack.** A box of 100 tablets → base unit `tablet`, pack unit `box`,
> units per pack `100`. **Get this wrong and every quantity for that medicine is
> wrong.** You can't change it later once stock exists.

### Stopping a medicine you no longer carry

Open the product → **Discontinue**. It's hidden from new work but its history stays.
You never delete products.

### Suppliers

**Suppliers** → add name, contact person, phone, email, address. These pre-fill your
purchase orders, so filling this in properly saves time later.

### Reports

**Reports** answers four questions:

| Section | Question |
| --- | --- |
| **Stock valuation** | How much money is on the shelves? |
| **Wastage** | What did we throw away, and what did it cost? |
| **Stock movement** | What went in and out? |
| **Not moving** | What's sitting there that nobody buys? |

**Not moving** is the one worth reading. That's money already spent, slowly walking
towards its own expiry date.

---

## Part 3 — Owner

*Everything above, plus this section. Only you can do these.*

### Adding a member of staff

**Staff** → **Add staff**

1. Their **name** and **email address**
2. Their **role**:
   - **Counter staff** — can look things up and dispense. Nothing else.
   - **Pharmacist** — the above plus deliveries, orders, corrections, reports.
   - **Owner** — everything, including this page.
3. A **temporary password** — tell it to them; they'll change it when they sign in

> **Create a second Owner.** If you're the only one and you get locked out, nobody
> can add staff or change settings.

### Resetting someone's password

**Staff** → find them → **⋯** → **Reset password**. Give them the new temporary one.
This signs them out everywhere immediately.

### When someone leaves

**Staff** → **⋯** → **Deactivate**.

**Deactivate, never delete.** They can't sign in any more, but their name stays on
everything they ever did. Deleting them would tear holes in your history.

### Settings

**Settings** holds your pharmacy details and — more importantly — two numbers:

| Setting | Default | What it does |
| --- | --- | --- |
| **Warning days** | 90 | How many days before expiry turns 🟠 orange |
| **Critical days** | 30 | How many days before it turns 🔴 red |

> **Set the warning to match your supplier's return window.** If they take returns
> up to 6 months before expiry, set it to **180**. Otherwise the system tells you
> about it after it's too late to send anything back. This is the most valuable
> setting on the page.

Also here: pharmacy name, timezone (`Asia/Manila`), currency (`PHP`).

### Audit log

**Audit log** shows every action anyone has taken — what, who, when, and the reason
where one was given.

**Read it once a month.** You're looking for patterns, not single entries: a lot of
adjustments from one person, corrections at odd hours, stock disposed of without
a clear reason.

---

## I want to…

| I want to… | Go to |
| --- | --- |
| See what needs attention today | **Dashboard** |
| Check if we have a medicine | **Stock on hand** → search |
| Serve a customer | **Dispense** |
| See what's expiring | **Expiry alerts** |
| Take in a delivery | **Purchase orders** → the order → **Receive** |
| Take in stock with no order | **Receive stock** |
| Order from a supplier | **Purchase orders** → **New order** |
| Fix a wrong quantity | **Stock on hand** → **⋯** → **Adjust lot** |
| Throw away expired stock | **Stock on hand** → **⋯** → **Dispose of lot** |
| Add a new medicine | **Products** → **New product** |
| Add a supplier | **Suppliers** |
| See what stock is worth | **Reports** |
| Add or remove staff | **Staff** |
| Change expiry warning periods | **Settings** |
| See who did something | **Audit log** |
| Change my own password | Your name, top right |

---

## When something goes wrong

**"There isn't enough stock" but I can see the boxes**
A delivery wasn't recorded. Tell the pharmacist. Don't reduce the amount to make
it go through.

**I typed the wrong number**
Don't try to undo it. Tell the pharmacist, who corrects it properly with a reason
attached. Nothing is ever lost.

**A menu item is missing**
Your role doesn't include it. That's normal — see the three roles above.

**"Lot already exists with a different expiry date"**
You've mistyped either the lot number or the date. Check the physical box.

**The page won't load**
Try any other website first. If that works and this doesn't, tell the owner.

**It's asking me to sign in again**
Normal after about a week, or on a different device.

**I forgot my password**
Only the owner can reset it.

---

## Three rules

1. **Record it as it happens.** Not at the end of the day. If the system and the
   shelf disagree, people stop trusting the system — and then it's worth nothing.
2. **Never share your login.** Every action carries your name. If someone else uses
   your account, their mistakes are yours.
3. **Red means stop.** Expired medicine isn't sold, isn't "used up quickly", and
   doesn't go home with anyone.

---

*Questions your pharmacist can't answer go to the owner. Never guess with stock
records — asking takes a minute, fixing a wrong count takes an afternoon.*

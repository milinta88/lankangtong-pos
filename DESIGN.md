# DESIGN.md — Langangtong POS Design Guide

Project: **ล้านก๋างโต้ง POS**  
Type: Cafe + restaurant POS, dine-in table system, customer QR order, stock, report, admin  
Frontend: **React + Vite + Tailwind**  
Backend: **Google Apps Script Web App API**  
Database: **Google Sheets**  
Receipt: **58mm thermal receipt**

---

## 0. Non-Negotiable Rules

This file is a design and UI guide. It must not be used to rewrite working business logic.

### Do not change

- Backend Apps Script API action names
- API request/response shapes
- Existing routes
- Checkout logic
- Table order logic
- Stock deduction logic
- PromptPay QR logic
- Receipt print width/layout
- Google Sheets schema unless explicitly requested
- Existing performance optimizations and cache logic

### Must keep working

- `/pos`
- `/tables`
- `/order`
- `/receipt/:orderId`
- `/stock`
- `/report`
- `/admin`

### Build requirement

Every UI change must pass:

```bash
npm run build
```

No browser console errors.

---

## 1. Product Identity

### Shop name

**ล้านก๋างโต้ง**

### Product personality

A warm Thai cafe / bistro POS system that feels:

- Modern
- Cozy
- Premium but simple
- Fast for cashier use
- Friendly for customers scanning table QR
- Touch-friendly
- Not like a rough prototype
- Not like a plain spreadsheet back office

### Visual mood

Use the feeling of:

- Modern Thai cafe
- Warm bistro
- Clean POS dashboard
- Simplified LINE MAN / GrabFood style for customer ordering

### Logo

No logo is required. Use text branding only:

```text
ล้านก๋างโต้ง
```

---

## 2. UX Priorities

### Cashier flow must be fast

The POS must help staff sell quickly:

1. Find menu
2. Add to cart
3. Select payment
4. Confirm
5. Print receipt

Avoid unnecessary popups and extra steps.

### Table flow must be clear

The table screen must make it obvious:

- Which table is available
- Which table is occupied
- Which table has an unpaid order
- How much each active table currently owes
- How to open, add items, and pay

### Customer QR order must feel easy

The `/order` customer page must feel like a mobile food ordering app:

- Big images
- Clear categories
- Clear prices
- Floating cart
- Simple checkout submit
- Friendly success state

### Backend state must remain trustworthy

The UI must not hide or confuse critical state:

- Paid vs unpaid
- Stock status
- Table status
- Payment method
- PromptPay amount
- Receipt total

---

## 3. Design Principles

### 3.1 Warm and clean

Use warm neutral backgrounds instead of plain white wherever appropriate.

Recommended background direction:

```text
warm cream / soft beige / warm gray
```

### 3.2 Touch-friendly

Buttons and interactive areas should be large enough for mouse, tablet, and touch screen use.

Recommended minimum:

```text
height: 44px+
border-radius: 14px+
```

### 3.3 Clear hierarchy

Important values must stand out:

- Total price
- Checkout button
- Table status
- Stock warning
- QR payment amount
- Report total sales

### 3.4 Compact where needed

Especially in the POS cart:

- Do not leave large empty white space.
- The cart should follow content height.
- Payment should remain visible.
- Only long cart item lists should scroll.

### 3.5 Customer pages should feel friendlier than staff pages

Staff pages can be denser. Customer `/order` should be simple, mobile-first, and attractive.

---

## 4. Color System

Use Tailwind classes. Avoid adding heavy UI libraries.

### Suggested palette

| Purpose | Suggested Direction |
|---|---|
| App background | warm cream / beige |
| Card background | white / warm white |
| Primary | coffee brown |
| Secondary primary | deep green |
| Accent | amber / soft gold |
| Success | green |
| Warning | amber |
| Danger | red |
| Text primary | near black |
| Text secondary | warm gray |
| Border | warm neutral |

### Suggested Tailwind usage

```text
Background: bg-stone-50 / bg-[#f7f1e8] / bg-[#f5efe6]
Card: bg-white border border-stone-200 shadow-sm
Primary button: bg-[#0f0b08] or bg-emerald-800
Cafe brown: bg-[#7a5438]
Accent: bg-amber-100 text-amber-800
Success: bg-emerald-50 text-emerald-700
Warning: bg-amber-50 text-amber-700
Danger: bg-rose-50 text-rose-700
```

Do not overuse bright colors. Keep the product warm and premium.

---

## 5. Typography

### General

Use the existing system font stack unless the project already includes a Thai web font.

Thai text must be readable.

### Hierarchy

| Element | Direction |
|---|---|
| Page title | bold, clear |
| Section heading | semi-bold |
| Menu name | bold, readable |
| Price | large and bold |
| Total | largest and high contrast |
| Helper text | muted gray |

### Avoid

- Tiny Thai text
- Low contrast text
- Too many font sizes on one card

---

## 6. Shared UI Components

Prefer reusable components.

Recommended components:

```text
AppShell
PageHeader
SectionCard
StatCard
Badge
Button
Input
EmptyState
LoadingState
ErrorState
PaymentMethodButton
MenuCard
CartPanel
TableCard
```

### Button states

Every important button should support:

- normal
- hover
- active/selected
- disabled
- loading

### Badge states

Recommended badge meanings:

```text
ปกติ
ใกล้หมด
หมด
AVAILABLE
OCCUPIED
READY_TO_PAY
PAID
UNPAID
QR
CASH
TRANSFER
CARD
```

---

## 7. App Shell and Navigation

### Staff pages

Use consistent navigation for:

```text
POS
Tables / โต๊ะ
Stock
Report
Admin
```

### Customer page

`/order` must not show staff navigation.

### Receipt page

`/receipt/:orderId` can show a minimal action bar:

```text
Back to POS
Refresh
Print
```

### AppShell design direction

- Warm sidebar or top navigation
- Clear active route
- Good spacing
- No clutter
- No logo required
- Shop name visible

---

## 8. Page Specifications

---

# 8.1 `/pos` — Cashier POS

## Goal

Make `/pos` feel like a real modern cashier POS for cafe/restaurant sales.

## Layout

Desktop/tablet:

```text
Left: menu browsing
Right: cart + payment
```

Mobile/narrow:

```text
Menu
Cart
Payment
```

## Left area

Must include:

- Page title / shop context
- Search bar
- Category pills
- Menu grid

## Category pills

- Active category must be visually obvious.
- Horizontal scroll on smaller screens.
- Do not wrap into messy multiple rows on mobile unless necessary.

## Menu cards

Each menu card should show:

- Image if available
- Warm placeholder if image missing
- Menu name
- Price
- Stock badge only when direct stock/tracked stock applies
- Recommended badge if `is_recommended`
- Prominent add button

### Menu card visual direction

- Rounded corners
- Soft shadow
- Large enough image
- Good text spacing
- Price should stand out
- Add button should be easy to click

## Cart panel

Critical rule:

**Do not create large empty white space under cart items.**

The cart should follow content height.

### Correct behavior

- 1–3 cart items: cart card height follows content.
- Many cart items: only the item list scrolls.
- Payment panel stays close below cart summary.
- Checkout button remains visible.

### Avoid

- `flex-1` stretching the cart item area
- `h-full` on cart item area
- large fixed `min-height`
- full-height white empty blocks
- `justify-between` that pushes payment down

### Suggested cart structure

```text
Cart header
Order type switch
Cart item list
  max-height only if many items
Order note
Discount
Subtotal / Discount / Total
Payment card
Checkout button
```

## Payment panel

Payment methods:

```text
CASH
QR
TRANSFER
CARD
```

Selected method must be obvious.

## QR payment panel

For QR/TRANSFER:

- Show PromptPay QR clearly
- Show amount large
- Show account name
- Show warning:

```text
กรุณาตรวจสอบยอดเงินเข้าก่อนกดยืนยัน
```

Do not auto-confirm payment. Staff must confirm manually.

## Checkout button

- Large
- High contrast
- Clearly says:

```text
บันทึกและพิมพ์
```

---

# 8.2 `/tables` — Staff Table Board

## Goal

Make `/tables` feel like a restaurant table board.

## Table cards

Show 10 table cards:

```text
T01–T10
```

Each card shows:

- Table name/no
- Status
- Current order total if occupied
- Item count if occupied
- Created time if occupied

## Status styles

| Status | Style |
|---|---|
| AVAILABLE | calm neutral or green |
| OCCUPIED | warm amber |
| READY_TO_PAY | blue or purple |

## Interaction

Click table:

- If available: open table
- If occupied: load current table order

## Table order panel

Should feel like a table bill:

- Current table
- Current items
- Add more menu items
- Total
- Payment methods
- Pay button

## Important business rule

Adding items to a table must not deduct stock.

Stock is deducted only when the table order is paid.

## Do not implement unless requested

- Split bill
- Merge table
- Move table
- Reservation

---

# 8.3 `/order` — Customer QR Table Order

## Goal

Make `/order` feel like a simplified mobile food ordering app.

Inspired by LINE MAN / GrabFood, but much simpler for dine-in QR ordering.

## Layout

Mobile-first.

## Header

Must show:

```text
ล้านก๋างโต้ง
โต๊ะ Txx
สั่งอาหารสำหรับโต๊ะนี้
```

Do not show staff navigation.

## Menu browsing

Should include:

- Category pills
- Search if useful
- Menu cards with images
- Price
- Add button

## Floating cart bar

At bottom:

```text
จำนวนรายการ
ยอดรวม
ดูตะกร้า / ส่งออเดอร์
```

## Cart review

Before submit, customer should see:

- Items
- Quantity
- Price
- Item note
- Overall note
- Submit button

## Success state

Friendly success message:

```text
ส่งออเดอร์แล้ว
กรุณารอพนักงานยืนยัน
```

Show:

- Table number
- Order number
- Total

## Error state

If token invalid, show friendly error:

```text
QR โต๊ะนี้ไม่ถูกต้องหรือหมดอายุ
กรุณาแจ้งพนักงาน
```

## Payment

Customer `/order` must not take payment in Phase 1.

Payment is handled by staff at `/tables`.

---

# 8.4 `/receipt/:orderId` — Receipt Preview

## Goal

Improve screen preview but preserve print layout exactly.

## Screen preview

- Warm clean background
- Receipt centered
- Action bar above
- Buttons: POS, Refresh, Print

## Print layout

Must remain:

```text
58mm
```

Do not make the printable receipt wider than 58mm.

## QR on receipt

PromptPay QR should show only when:

```text
payment_method = QR or TRANSFER
receipt_qr_enabled = true
promptpay_id exists
```

Do not show payment QR for CASH or CARD receipts.

---

# 8.5 `/stock` — Stock Dashboard

## Goal

Make stock page easy to monitor.

## Summary cards

Show:

- Total stock items
- Low stock count
- Out of stock count

## Table

Columns should be readable:

- Item
- Stock quantity
- Low stock level
- Status
- Stock type

## Status badges

```text
ปกติ
ใกล้หมด
หมด
```

## Highlighting

Low stock and out-of-stock items should be visually obvious but not overly aggressive.

---

# 8.6 `/report` — Daily Sales Dashboard

## Goal

Make the report page feel like a sales dashboard.

## Summary cards

Show:

- Total sales
- Order count
- Item count
- Cash sales
- Transfer/QR/Card sales

Total sales should be the hero value.

## Sections

- Top selling items
- Payment summary
- Recent paid orders

## Date picker

Must be easy to find and aligned with refresh button.

---

# 8.7 `/admin` — Menu Management

## Goal

Make admin easier to use without clutter.

## Table

Desktop-first.

Must support editing:

- Price
- Image URL
- Availability
- Recommended
- Track stock
- Stock mode
- Stock quantity
- Low stock level
- Sort order

## Image thumbnail

Show current image if available.

If no image, show clean placeholder.

## Save button state

Each row should show save status:

```text
normal
saving
saved
error
```

## Avoid

- Too many controls squeezed tightly
- Tiny inputs
- Unclear save state
- Accidentally editable critical IDs

Do not allow editing:

```text
menu_id
```

unless explicitly requested.

---

## 9. Receipt and Print Rules

### Critical

Never break 58mm print receipt.

### Print CSS must preserve

```css
@media print {
  @page {
    size: 58mm auto;
    margin: 0;
  }
}
```

Screen preview may be wider visually, but the printable receipt content must remain 58mm.

---

## 10. PromptPay QR Rules

### POS payment QR

For QR or TRANSFER payment:

- Generate QR locally in browser.
- Use `promptpay_id` from settings.
- Amount must equal payable total.
- Staff must confirm payment manually.

### Receipt QR

Show only for:

```text
QR
TRANSFER
```

Do not show for:

```text
CASH
CARD
```

### QR size

```text
receipt_width = 58mm
receipt_qr_size_mm = 28–32mm
recommended = 30
```

Do not set QR size to 58mm.

---

## 11. Performance Rules

The UI must respect existing backend performance work.

### Do not undo

- `GET_MENU` cache
- `GET_SETTINGS` cache
- `DATABASE_SCHEMA_VERSION`
- lightweight `GET_TABLES`
- `/tables` refresh optimization

### Frontend refresh

For `/tables`:

- Auto refresh interval must be at least 15 seconds.
- Pause refresh when table order panel or QR panel is open.
- Manual refresh button should remain.
- Do not reload menu/settings every table refresh.

---

## 12. Technical Constraints

### Allowed

- React
- Vite
- Tailwind
- Existing utility packages
- Existing QR packages

### Avoid

- Heavy UI frameworks
- Major architecture rewrite
- New backend service
- Changing Google Sheets schema unless task explicitly asks
- Changing route names

---

## 13. Redesign Workflow for Codex

When making UI changes:

1. Read this `DESIGN.md`.
2. Identify pages/components to change.
3. Keep backend APIs untouched.
4. Keep business logic untouched.
5. Update shared UI components first.
6. Apply changes page by page.
7. Run `npm run build`.
8. Report:
   - files changed
   - visual improvements
   - risks
   - tests run

---

## 14. Recommended UI Redesign Phasing

### Phase 1

Focus:

```text
/pos
/tables
/order
```

These are the most important user-facing pages.

### Phase 2

Focus:

```text
/stock
/report
/admin
```

Back-office polish.

### Phase 3

Focus:

```text
/receipt
```

Screen preview polish only. Do not break print layout.

---

## 15. Example Task Prompt to Use With This File

Use this prompt after adding `DESIGN.md`:

```text
Read DESIGN.md and redesign only the frontend UI for /pos, /tables, and /order.

Important:
- Do not change backend Apps Script files.
- Do not change API contracts.
- Do not change business logic.
- Do not change checkout/table/payment behavior.
- Keep performance optimizations.
- Keep receipt print CSS unchanged.
- Focus on making the UI feel like a polished modern Thai cafe POS and mobile food ordering app.
- npm run build must pass.

After changes, summarize:
1. files changed
2. UI improvements
3. anything risky
```

For back-office:

```text
Read DESIGN.md and apply the same design system to /stock, /report, and /admin.
Do not touch /pos, /tables, /order unless necessary for shared components.
Do not change backend or business logic.
npm run build must pass.
```

---

## 16. Definition of Done

A UI redesign is done only when:

- `npm run build` passes
- No console errors
- `/pos` checkout still works
- PromptPay QR still works
- `/tables` open/add/pay still works
- `/order` customer submit still works
- `/receipt` print layout remains 58mm
- `/stock`, `/report`, `/admin` still load correctly
- UI feels more polished, warm, premium, and touch-friendly

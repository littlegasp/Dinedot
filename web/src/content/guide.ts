/* Help guide for restaurant staff. House rule: every change people can see ships with its
   update here IN THE SAME COMMIT, plus a line at the top of WHATS_NEW (newest first).
   Write for restaurant staff: short steps, button names exactly as on screen, no technical words.
   GUIDE is a Record over every Route, so a screen without a Help section doesn't build. */
import type { Route } from "@/lib/routes";

export type Section = { title: string; who: string; intro: string; steps: string[]; tips?: string[] };

export const WHATS_NEW: { date: string; text: string }[] = [
  { date: "11 Nov 2026", text: "Opening a link to a screen your role can't use now takes you to your home screen, and the address bar shows where you are." },
  { date: "11 Nov 2026", text: "New screens: Menu, Tables & QR, Team, Settings, Bills and this Help guide. Everything a restaurant needs to run on DineOS on its own." },
  { date: "11 Nov 2026", text: "Forgot your password? The link in the email now opens a page to set a new one." },
  { date: "11 Nov 2026", text: "DineOS is live: Today, POS, Floor, Kitchen and the guest QR page work on real data." },
];

export const GUIDE: Record<Route, Section> = {
  today: {
    title: "Today", who: "Owner and manager",
    intro: "How the day is going: sales, bills, tables and anything that needs someone's attention.",
    steps: [
      "The four boxes at the top compare today with the same day last week, once the first bill is closed.",
      "Needs attention lists calls from tables and orders that have been in the kitchen for 15 minutes or more. Tap Done when it's handled.",
      "Pause QR orders stops guests ordering from their phones (for example when the kitchen is full). Tap Resume QR orders to start again.",
      "The download button saves today's bills as a spreadsheet file.",
    ],
  },
  pos: {
    title: "POS & billing", who: "Owner, manager and waiter",
    intro: "Take orders at the table or counter and close bills.",
    steps: [
      "Pick the table at the top. A coloured dot shows if it's free (grey), ordered (amber), eating (green) or asking for the bill (coral).",
      "Tap dishes to add them. Dishes with sizes or extras ask you to choose first.",
      "Add a note for the kitchen if needed, then tap Send.",
      "When the guests are ready to pay, tap Take payment. Choose UPI, Card, Cash or Mixed, type the UPI or card reference if you have it, and tap Mark paid.",
    ],
    tips: ["The bill total always comes from the system, so it matches what the guest sees on their phone.", "For cash, type what the guest handed over to see the change."],
  },
  floor: {
    title: "Floor", who: "Owner, manager and waiter",
    intro: "Every table at a glance, with calls from guests at the top.",
    steps: [
      "Calls from tables (waiter, water, bill) show at the top. Tap Done once you've gone to the table.",
      "Tap a table to see its orders. Tap Served when the food reaches the table.",
      "Add items opens the POS for that table. Bill & pay goes straight to payment.",
      "Managers can clear a table without payment (for a walk-out or a test). Write the reason; it's saved in the activity history.",
    ],
  },
  kitchen: {
    title: "Kitchen", who: "Everyone",
    intro: "New orders appear on their own, oldest first. Made for a wall screen or tablet.",
    steps: [
      "Tap Start cooking when you begin an order, Mark ready when it's plated, and Picked up when the waiter takes it.",
      "An order turns amber as it gets close to 15 minutes and red with the word late after that.",
      "Notes from the guest or waiter (less spicy, allergies) show in a yellow box.",
      "Tapped the wrong button? The arrow button moves the order back one step.",
    ],
  },
  bills: {
    title: "Bills", who: "Owner, manager and waiter",
    intro: "Every closed bill: paid or cleared, with how it was paid.",
    steps: [
      "Choose Today, Yesterday or Last 7 days, or pick your own dates.",
      "Tap a bill to see the dishes, tax, tip, reference and who closed it.",
      "Download saves the bills on screen as a spreadsheet file.",
    ],
  },
  menu: {
    title: "Menu", who: "Owner and manager edit; everyone can mark dishes sold out",
    intro: "Sections and dishes guests see on the QR menu and staff see in the POS.",
    steps: [
      "Tap Add section to make a section (for example Starters). Switch a section off to hide it without deleting it.",
      "Tap Add dish, or tap a dish to change it: name, price, veg / non-veg / egg, photo, sizes (Half / Full) and extras (Extra cheese).",
      "The Sold out switch hides a dish from guests straight away. Kitchen staff can use it too.",
      "Price changes are saved in the activity history with the old and new price.",
    ],
    tips: ["Photos are shrunk on your phone before upload, so they load fast for guests."],
  },
  tables: {
    title: "Tables & QR", who: "Owner and manager",
    intro: "Your tables and the QR code stuck on each one.",
    steps: [
      "Tap Add table, give it a number (T1, P2…), the area and seats.",
      "Print QR codes prints one card per table. Stick each card on its table.",
      "If a QR card is lost or copied, open the table and tap Replace QR. The old code stops working at once; print the new one.",
      "Switch a table off to hide it for a while. A table with bills on record can't be deleted, only switched off.",
    ],
  },
  team: {
    title: "Team", who: "Owner",
    intro: "Who can sign in, and what they can do.",
    steps: [
      "Tap Add login, enter their name, email, role and a first password. Tell them the password in person.",
      "Roles: Owner (everything), Manager (everything except Team and Settings), Waiter (floor, POS, bills), Kitchen (kitchen screen and sold-out switches).",
      "Switch someone off when they leave or are on leave. They can't sign in until you switch them on.",
      "Set password gives someone a new password if they've forgotten theirs.",
    ],
  },
  settings: {
    title: "Settings", who: "Owner",
    intro: "Your restaurant's details, taxes, payments and the guest page.",
    steps: [
      "Restaurant: name, tagline, cover photo and welcome note shown at the top of the guest page.",
      "Bill: GST % and service charge %, and the tip choices guests see.",
      "Payments: your UPI ID (money goes straight to you, no fees), and whether you take cash and card.",
      "Guest Wi-Fi: shown to guests only while they have an open bill.",
      "Tap Save at the bottom. Changes reach guests' phones within a few seconds.",
    ],
  },
  help: {
    title: "Help", who: "Everyone",
    intro: "This guide. It's updated every time a screen changes.",
    steps: ["Pick a screen on the left (or above on a phone) to read how it works.", "What's new lists recent changes, newest first."],
  },
  design: {
    title: "Design system", who: "For the DineOS team",
    intro: "Colours and building blocks used on every screen.",
    steps: ["Switch between light and dark with the moon / sun button to compare."],
  },
};

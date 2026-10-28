// DEMO DATA: illustrative sample products and prices for planning only.
// These are not live retailer prices and do not represent real inventory.

export const CATEGORIES = [
  "Tableware",
  "Serving & Tables",
  "Decorations",
  "Event Supplies",
] as const;

export type Category = (typeof CATEGORIES)[number];

export type Product = {
  /** Stable, unique identifier. Saved carts reference products by this ID. */
  id: string;
  name: string;
  description: string;
  category: Category;
  /** Price of one pack in US cents. */
  priceCents: number;
  /** Number of individual units contained in one pack. */
  unitsPerPack: number;
  /** Plural label for a single unit, e.g. "cups" or "rolls". */
  unitLabel: string;
};

export const PRODUCTS: readonly Product[] = [
  {
    id: "plates-paper-9in",
    name: "Paper Dinner Plates, 9 in",
    description: "Sturdy white plates that hold up to full meals.",
    category: "Tableware",
    priceCents: 899,
    unitsPerPack: 50,
    unitLabel: "plates",
  },
  {
    id: "plates-dessert-7in",
    name: "Paper Dessert Plates, 7 in",
    description: "Smaller plates for snacks, cake, and appetizers.",
    category: "Tableware",
    priceCents: 649,
    unitsPerPack: 50,
    unitLabel: "plates",
  },
  {
    id: "cups-paper-12oz",
    name: "Paper Cups, 12 oz",
    description: "Insulated cups for coffee, tea, or cold drinks.",
    category: "Tableware",
    priceCents: 749,
    unitsPerPack: 50,
    unitLabel: "cups",
  },
  {
    id: "cups-plastic-16oz",
    name: "Plastic Party Cups, 16 oz",
    description: "Classic red cups for punch, soda, and water.",
    category: "Tableware",
    priceCents: 999,
    unitsPerPack: 50,
    unitLabel: "cups",
  },
  {
    id: "napkins-beverage",
    name: "Beverage Napkins",
    description: "Two-ply cocktail napkins for drink stations.",
    category: "Tableware",
    priceCents: 499,
    unitsPerPack: 100,
    unitLabel: "napkins",
  },
  {
    id: "napkins-dinner",
    name: "Dinner Napkins",
    description: "Larger three-ply napkins for meals.",
    category: "Tableware",
    priceCents: 599,
    unitsPerPack: 50,
    unitLabel: "napkins",
  },
  {
    id: "cutlery-combo",
    name: "Plastic Cutlery Combo",
    description: "Mixed forks, knives, and spoons in one box.",
    category: "Tableware",
    priceCents: 899,
    unitsPerPack: 96,
    unitLabel: "pieces",
  },
  {
    id: "forks-compostable",
    name: "Compostable Forks",
    description: "Plant-based forks for low-waste events.",
    category: "Tableware",
    priceCents: 699,
    unitsPerPack: 50,
    unitLabel: "forks",
  },
  {
    id: "tablecloth-plastic-rect",
    name: "Plastic Tablecloths, 54 × 108 in",
    description: "Fits standard 6–8 ft rectangular tables.",
    category: "Serving & Tables",
    priceCents: 999,
    unitsPerPack: 4,
    unitLabel: "tablecloths",
  },
  {
    id: "trays-serving-rect",
    name: "Plastic Serving Trays",
    description: "Rectangular trays for sandwiches and finger food.",
    category: "Serving & Tables",
    priceCents: 1199,
    unitsPerPack: 6,
    unitLabel: "trays",
  },
  {
    id: "pans-aluminum-half",
    name: "Aluminum Half-Size Pans",
    description: "Disposable pans for hot food and buffet lines.",
    category: "Serving & Tables",
    priceCents: 1299,
    unitsPerPack: 10,
    unitLabel: "pans",
  },
  {
    id: "banner-paper-roll",
    name: "Kraft Paper Banner Roll, 30 in × 25 ft",
    description: "Blank roll for hand-painted signs and banners.",
    category: "Decorations",
    priceCents: 1499,
    unitsPerPack: 1,
    unitLabel: "roll",
  },
  {
    id: "banner-letter-kit",
    name: "Letter Banner Kit",
    description: "Reusable card letters and string to spell any message.",
    category: "Decorations",
    priceCents: 1099,
    unitsPerPack: 1,
    unitLabel: "kit",
  },
  {
    id: "balloons-latex-12in",
    name: "Latex Balloons, 12 in",
    description: "Assorted colors for entrances and photo areas.",
    category: "Decorations",
    priceCents: 849,
    unitsPerPack: 50,
    unitLabel: "balloons",
  },
  {
    id: "streamers-crepe",
    name: "Crepe Paper Streamers",
    description: "Assorted-color rolls for walls and tables.",
    category: "Decorations",
    priceCents: 699,
    unitsPerPack: 6,
    unitLabel: "rolls",
  },
  {
    id: "name-tags-adhesive",
    name: "Adhesive Name Tags",
    description: "\"Hello, my name is\" stickers for check-in.",
    category: "Event Supplies",
    priceCents: 599,
    unitsPerPack: 100,
    unitLabel: "tags",
  },
  {
    id: "markers-permanent",
    name: "Permanent Markers",
    description: "Fine-tip black markers for name tags and signs.",
    category: "Event Supplies",
    priceCents: 949,
    unitsPerPack: 12,
    unitLabel: "markers",
  },
  {
    id: "tape-masking",
    name: "Masking Tape, 1 in",
    description: "Easy-release tape for hanging signs and decor.",
    category: "Event Supplies",
    priceCents: 799,
    unitsPerPack: 3,
    unitLabel: "rolls",
  },
];

export const PRODUCTS_BY_ID: ReadonlyMap<string, Product> = new Map(
  PRODUCTS.map((product) => [product.id, product]),
);

// The bakery that the games menus are laid out as: a striped wall under a
// scalloped awning, pill signs, and oak shelves the recipe books stand
// on. Shared by /games (the gated All Games menu) and /play (the public
// arcade) so the two can never drift apart.
//
// Server components, no state. The oak materials (`.shelf-*`) live in
// globals.css because they need pseudo-elements.

/** The shop: cream wall with soft pink candy stripes, awning along the top. */
export function BakeryWall({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <main
      className={'relative flex flex-1 flex-col items-center overflow-hidden pb-10 ' + className}
      style={{
        backgroundColor: '#fff7ed',
        backgroundImage:
          'repeating-linear-gradient(90deg, rgba(251,207,232,0.45) 0 28px, transparent 28px 56px)',
      }}
    >
      {/* Shop awning: candy stripes with a scalloped edge, and the shade it throws. */}
      <div aria-hidden className="w-full" style={{ filter: 'drop-shadow(0 4px 3px rgba(136,19,55,0.18))' }}>
        <div
          className="h-10 w-full"
          style={{
            backgroundImage: 'repeating-linear-gradient(90deg, #fb7185 0 40px, #fff 40px 80px)',
          }}
        />
        <div
          className="h-5 w-full"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20px 0, #fb7185 19px, transparent 20px), radial-gradient(circle at 60px 0, #fff 19px, transparent 20px)',
            backgroundSize: '80px 20px',
          }}
        />
      </div>
      {children}
    </main>
  );
}

/** The sign above a shelf: a white pill, like the "What is this?" chrome. */
export function ShelfSign({
  emoji,
  children,
  as: Tag = 'h2',
}: {
  emoji: string;
  children: React.ReactNode;
  as?: 'h2' | 'h3';
}): React.ReactElement {
  return (
    <Tag className="inline-flex items-center gap-2 rounded-full border-2 border-rose-200 bg-white px-4 py-1 font-display text-lg font-bold text-amber-950 shadow-[0_6px_10px_-4px_rgba(251,113,133,0.5)]">
      <span aria-hidden>{emoji}</span>
      {children}
    </Tag>
  );
}

/** A bakery shelf: a sign, then the books in rows, each row standing
 *  on an oak plank. The plank, its bracket, the shadow it throws on the wall and
 *  the contact shadow under the book are all drawn per cell with no column
 *  gap, so the cells' planks join into one board per row at any column count.
 *  The materials live in globals.css under `.shelf-*`. */
export function Shelf({
  title,
  emoji,
  note,
  children,
}: {
  title: string;
  emoji: string;
  note?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section aria-label={title}>
      <ShelfSign emoji={emoji}>{title}</ShelfSign>
      {note && <p className="mt-1 text-xs text-amber-900/70">{note}</p>}
      <ul className="mt-3 grid grid-cols-2 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
        {Array.isArray(children)
          ? children.map((child, i) => <ShelfSlot key={i}>{child}</ShelfSlot>)
          : <ShelfSlot>{children}</ShelfSlot>}
      </ul>
    </section>
  );
}

export function ShelfSlot({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <li className="relative px-2 pb-5 pt-6 sm:px-3">
      {/* Painted back to front: wall shade, contact shadow, then the book
          (RecipeBook is `relative`, so it stacks above the two spans before
          it), then the plank in front of the book's bottom edge. */}
      <span aria-hidden className="shelf-wall-shade" />
      <span aria-hidden className="shelf-contact" />
      {children}
      <span aria-hidden className="shelf-plank" />
      <span aria-hidden className="shelf-bracket" />
    </li>
  );
}

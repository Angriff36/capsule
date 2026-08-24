type Props = {
  readonly title: string;
  readonly description: string;
};

/** Shared tab title block used above Event Photo Gallery / Overview / Timeline. */
export function EventTabIntro({ title, description }: Props) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="text-sm text-ink-2">{description}</p>
    </div>
  );
}

type Props = {
  readonly title: string;
  readonly description: string;
};

/** Shared tab title block used above Event Photo Gallery / Overview / Timeline. */
export function EventTabIntro({ title, description }: Props) {
  return (
    <div>
      <h2 className="font-display text-lg">{title}</h2>
      <p className="text-base text-ink-2">{description}</p>
    </div>
  );
}

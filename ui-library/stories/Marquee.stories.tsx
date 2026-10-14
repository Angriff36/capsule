import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import { Marquee } from "../components/marquee";
import { cn } from "../lib/utils";

const meta: Meta = {
  title: "UI Layouts Library/Animation & Motion/Marquee",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Marquee (https://ui-layouts.com/components/marquee): an endless scrolling strip, horizontal or vertical, optionally reversed and paused on hover.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

const reviews = [
  {
    name: "Jack",
    username: "@jack",
    body: "I've never seen anything like this before. It's amazing. I love it.",
    img: "bg-green-500",
  },
  {
    name: "Jill",
    username: "@jill",
    body: "I don't know what to say. I'm speechless. This is amazing.",
    img: "bg-blue-500",
  },
  {
    name: "John",
    username: "@john",
    body: "I'm at a loss for words. This is amazing. I love it.",
    img: "bg-red-500",
  },
  {
    name: "Jane",
    username: "@jane",
    body: "I'm at a loss for words. This is amazing. I love it.",
    img: "bg-yellow-500",
  },
  {
    name: "Jenny",
    username: "@jenny",
    body: "I'm at a loss for words. This is amazing. I love it.",
    img: "bg-purple-500",
  },
  {
    name: "James",
    username: "@james",
    body: "I'm at a loss for words. This is amazing. I love it.",
    img: "bg-pink-500",
  },
];

const firstRow = reviews.slice(0, reviews.length / 2);
const secondRow = reviews.slice(reviews.length / 2);

const ReviewCard = ({
  img,
  name,
  username,
  body,
}: {
  img: string;
  name: string;
  username: string;
  body: string;
}) => {
  return (
    <figure
      className={cn(
        "relative w-64 cursor-pointer overflow-hidden rounded-xl border p-4",
        "border-neutral-950/10 bg-neutral-950/1 hover:bg-neutral-950/5",
        "dark:border-neutral-50/10 dark:bg-neutral-50/10 dark:hover:bg-neutral-50/15",
      )}
    >
      <div className="absolute bottom-0 left-0 right-0 top-0 bg-[radial-gradient(125%_125%_at_50%_10%,rgba(255,255,255,0)_40%,#335fee_100%)] pointer-events-none"></div>
      <div className="flex flex-row items-center gap-2">
        <div className={cn("rounded-full w-8 h-8", img)}></div>
        <div className="flex flex-col">
          <figcaption className="text-sm font-medium text-foreground">
            {name}
          </figcaption>
          <p className="text-xs font-medium text-muted-foreground">
            {username}
          </p>
        </div>
      </div>
      <blockquote className="mt-2 text-sm">{body}</blockquote>
    </figure>
  );
};

export const Reviews: Story = {
  render: () => (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-lg py-10">
      <Marquee pauseOnHover className="[--duration:20s]">
        {firstRow.map((review) => (
          <ReviewCard key={review.username} {...review} />
        ))}
      </Marquee>
      <Marquee reverse pauseOnHover className="[--duration:20s]">
        {secondRow.map((review) => (
          <ReviewCard key={review.username} {...review} />
        ))}
      </Marquee>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-linear-to-r from-background"></div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-linear-to-l from-background"></div>
    </div>
  ),
};

const logos = [
  { name: "Apple", img: "https://cdn.simpleicons.org/apple/000/fff" },
  { name: "Google", img: "https://cdn.simpleicons.org/google/000/fff" },
  { name: "Facebook", img: "https://cdn.simpleicons.org/facebook/000/fff" },
  {
    name: "ChatGPT",
    img: "https://upload.wikimedia.org/wikipedia/commons/6/66/OpenAI_logo_2025_%28symbol%29.svg",
  },
  {
    name: "X",
    img: "https://upload.wikimedia.org/wikipedia/commons/0/09/X_%28formerly_Twitter%29_logo_late_2025.svg",
  },
];

export const Logos: Story = {
  render: () => (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-lg bg-muted py-20">
      <Marquee className="[--gap:3rem]">
        {logos.map((logo) => (
          <div key={logo.name} className="h-12 w-12 cursor-pointer">
            <img src={logo.img} alt={logo.name} />
          </div>
        ))}
      </Marquee>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-linear-to-r from-muted"></div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-linear-to-l from-muted"></div>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="relative mx-auto flex h-72 w-full max-w-xs flex-row justify-center gap-4 overflow-hidden rounded-lg">
      <Marquee vertical pauseOnHover className="[--duration:20s]">
        {firstRow.map((review) => (
          <ReviewCard key={review.username} {...review} />
        ))}
      </Marquee>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/4 bg-linear-to-b from-background"></div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-linear-to-t from-background"></div>
    </div>
  ),
};

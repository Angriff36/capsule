import { Cat, Dog, Fish, Rabbit, Turtle } from "lucide-react";
import { useState } from "react";
import { MultiSelect } from "./multi-selector";

const frameworksList = [
  { value: "react", label: "React", icon: Turtle, disable: true },
  { value: "nextjs", label: "Nextjs", icon: Cat },
  { value: "vue", label: "Vue", icon: Dog },
  { value: "svelte", label: "Svelte", icon: Rabbit },
  { value: "ember", label: "Ember", icon: Fish },
];

export function MultiSelectorDemo() {
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>([
    "nextjs",
    "svelte",
  ]);

  return (
    <div className="py-20 w-96 mx-auto">
      <MultiSelect
        options={frameworksList}
        onValueChange={setSelectedFrameworks}
        defaultValue={selectedFrameworks}
        placeholder="Select frameworks"
        popoverClass="w-96"
        maxCount={3}
      />
    </div>
  );
}

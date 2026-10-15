import { Copy, Pipette } from "lucide-react";
import { HexColorPicker } from "react-colorful";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label: string;
  isEyeDroppper?: boolean;
  className?: string;
}

interface EyeDropperResult {
  sRGBHex: string;
}
interface EyeDropperInstance {
  open: () => Promise<EyeDropperResult>;
}
type EyeDropperConstructor = new () => EyeDropperInstance;

export function ColorPicker({
  color,
  onChange,
  label,
  isEyeDroppper = false,
  className,
}: ColorPickerProps) {
  function copyToClipboard() {
    navigator.clipboard.writeText(color);
    toast("Copied!", {
      description: `${color} copied to clipboard`,
      duration: 2000,
    });
  }

  async function useEyeDropper() {
    if (!("EyeDropper" in window)) {
      toast.error("Not supported", {
        description: "Eyedropper is not supported in your browser",
        duration: 3000,
      });
      return;
    }

    try {
      const EyeDropper = (
        window as unknown as { EyeDropper: EyeDropperConstructor }
      ).EyeDropper;
      const result = await new EyeDropper().open();
      onChange(result.sRGBHex);
    } catch (e) {
      console.error("Error using eyedropper", e);
    }
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Label className="w-24">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-8 w-12 border-2 p-0"
            style={{ backgroundColor: color }}
          >
            <span className="sr-only">Pick a color</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-3 bg-primary-foreground">
          <HexColorPicker
            color={color}
            onChange={onChange}
            className="w-full!"
          />
          <div className="mt-2 flex w-full gap-2">
            <Input
              value={color}
              onChange={(e) => onChange(e.target.value)}
              className="h-10 w-full"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={copyToClipboard}
              className="h-10 w-12 shrink border-neutral-300 bg-neutral-100 text-neutral-900 hover:bg-neutral-200"
              style={{ borderRadius: "6px" }}
            >
              <Copy className="h-4 w-4" />
              <span className="sr-only">Copy color</span>
            </Button>
          </div>

          {isEyeDroppper && (
            <div className="mt-2 flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={useEyeDropper}
                className="h-10 w-10 border-neutral-300 bg-neutral-100 text-neutral-900 hover:bg-neutral-200"
                style={{ borderRadius: "6px" }}
              >
                <Pipette className="h-4 w-4" />
                <span className="sr-only">Pick color</span>
              </Button>

              <div
                className="h-10 flex-1"
                style={{ backgroundColor: color, borderRadius: "6px" }}
              />
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

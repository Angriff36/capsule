import { useState } from "react";
import { isValidPhoneNumber } from "react-phone-number-input";
import { z } from "zod";
import { PhoneInput } from "./phone-input";

// Zod schema for phone validation
const FormSchema = z.object({
  phone: z
    .string()
    .min(1, "Phone number is required")
    .refine((value) => value && isValidPhoneNumber(value), {
      message: "Invalid phone number",
    }),
});

export default function PhoneNumber() {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = FormSchema.safeParse({ phone });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Invalid phone number");
      return;
    }
    setError(null);
    alert(`You submitted the following values: ${JSON.stringify(result.data)}`);
  };

  return (
    <div className="relative mt-2 flex   justify-center">
      <form onSubmit={onSubmit} className="flex flex-col items-start space-y-3">
        <div className="flex flex-col items-start">
          <label htmlFor="phone" className="text-left">
            Phone Number
          </label>
          <PhoneInput
            value={phone}
            onChange={setPhone}
            id="phone"
            placeholder="Enter a phone number"
            className="w-full border rounded-lg"
          />
          {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
        </div>

        <button
          type="submit"
          className="p-2 bg-primary text-background rounded-md text-sm"
        >
          Submit
        </button>
      </form>
    </div>
  );
}

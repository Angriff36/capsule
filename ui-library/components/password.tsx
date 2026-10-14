import { useMemo, useState } from "react";
import { Check, CheckCheck, Eye, EyeOff, X } from "../lib/icons-forms";

const PASSWORD_REQUIREMENTS = [
  { regex: /.{8,}/, text: "At least 8 characters" },
  { regex: /[0-9]/, text: "At least 1 number" },
  { regex: /[a-z]/, text: "At least 1 lowercase letter" },
  { regex: /[A-Z]/, text: "At least 1 uppercase letter" },
  { regex: /[!-/:-@[-`{-~]/, text: "At least 1 special characters" },
] as const;

type StrengthScore = 0 | 1 | 2 | 3 | 4 | 5;

const STRENGTH_CONFIG = {
  colors: {
    0: "bg-border",
    1: "bg-red-500",
    2: "bg-orange-500",
    3: "bg-amber-500",
    4: "bg-amber-700",
    5: "bg-emerald-500",
  } satisfies Record<StrengthScore, string>,
  texts: {
    0: "Enter a password",
    1: "Weak password",
    2: "Medium password!",
    3: "Strong password!!",
    4: "Very Strong password!!!",
  } satisfies Record<Exclude<StrengthScore, 5>, string>,
} as const;

type Requirement = {
  met: boolean;
  text: string;
};

type PasswordStrength = {
  score: StrengthScore;
  requirements: Requirement[];
};

function usePasswordStrength(password: string): PasswordStrength {
  return useMemo((): PasswordStrength => {
    const requirements = PASSWORD_REQUIREMENTS.map((req) => ({
      met: req.regex.test(password),
      text: req.text,
    }));

    return {
      score: requirements.filter((req) => req.met).length as StrengthScore,
      requirements,
    };
  }, [password]);
}

function strengthText(score: StrengthScore): string {
  return STRENGTH_CONFIG.texts[
    Math.min(score, 4) as keyof typeof STRENGTH_CONFIG.texts
  ];
}

function RequirementList({
  requirements,
  MetIcon,
}: {
  requirements: Requirement[];
  MetIcon: typeof Check;
}) {
  return (
    <ul className="space-y-1.5" aria-label="Password requirements">
      {requirements.map((req) => (
        <li key={req.text} className="flex items-center space-x-2">
          {req.met ? (
            <MetIcon size={16} className="text-emerald-500" />
          ) : (
            <X size={16} className="text-muted-foreground/80" />
          )}
          <span
            className={`text-xs ${req.met ? "text-emerald-600" : "text-muted-foreground"}`}
          >
            {req.text}
            <span className="sr-only">
              {req.met ? " - Requirement met" : " - Requirement not met"}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export const PasswordInput = () => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="w-96 mx-auto py-14">
      <label htmlFor="pass" className="text-sm font-normal">
        Password
      </label>
      <div className="relative mt-1">
        <input
          type={isVisible ? "text" : "password"}
          id="pass"
          placeholder="Password"
          className="bg-muted w-full outline-hidden focus-within:border-blue-700 rounded-md p-2  border-2 "
        />
        <div
          className="absolute top-3 right-4 text-2xl text-muted-foreground cursor-pointer"
          onClick={() => setIsVisible((prev) => !prev)}
        >
          {isVisible ? <Eye size={22} /> : <EyeOff size={22} />}
        </div>
      </div>
    </div>
  );
};

export const PasswordStrengthBar = () => {
  const [password, setPassword] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const strength = usePasswordStrength(password);

  return (
    <div className="w-96 mx-auto py-14">
      <form className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={isVisible ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-invalid={strength.score < 4}
            aria-describedby="password-strength"
            className="w-full p-2 border-2 rounded-md bg-muted outline-hidden focus-within:border-blue-700 transition"
          />
          <button
            type="button"
            onClick={() => setIsVisible((prev) => !prev)}
            aria-label={isVisible ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex items-center justify-center w-9 text-muted-foreground/80 "
          >
            {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </form>

      <div
        className="mt-3 mb-2 h-1 rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuenow={strength.score}
        aria-valuemin={0}
        aria-valuemax={4}
      >
        <div
          className={`h-full ${STRENGTH_CONFIG.colors[strength.score]} transition-all duration-500`}
          style={{ width: `${(strength.score / 5) * 100}%` }}
        />
      </div>

      <p
        id="password-strength"
        className="mb-2 text-sm font-medium flex justify-between"
      >
        <span>Must contain:</span>
        <span>{strengthText(strength.score)}</span>
      </p>

      <RequirementList requirements={strength.requirements} MetIcon={Check} />
    </div>
  );
};

const SEGMENT_COLORS = [
  "bg-green-200",
  "bg-green-300",
  "bg-green-400",
  "bg-green-500",
  "bg-green-600",
];

export const PasswordStrengthSegments = () => {
  const [password, setPassword] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const strength = usePasswordStrength(password);

  return (
    <div className="w-96 mx-auto py-14 ">
      <form className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={isVisible ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-invalid={strength.score < 4}
            aria-describedby="password-strength"
            className="w-full p-2 border-2 rounded-md bg-muted outline-hidden focus-within:border-blue-700 transition"
          />
          <button
            type="button"
            onClick={() => setIsVisible((prev) => !prev)}
            aria-label={isVisible ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 outline-hidden flex items-center justify-center w-9 text-muted-foreground/80 hover:text-foreground  "
          >
            {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </form>
      <div className="flex gap-2 w-full justify-between mt-2">
        {SEGMENT_COLORS.map((color, index) => (
          <span
            key={color}
            className={`${strength.score >= index + 1 ? color : "bg-muted"}  p-1 rounded-full w-full`}
          ></span>
        ))}
      </div>

      <p
        id="password-strength"
        className="my-2 text-sm font-medium flex justify-between"
      >
        <span>Must contain:</span>
        <span>{strengthText(strength.score)}</span>
      </p>

      <RequirementList
        requirements={strength.requirements}
        MetIcon={CheckCheck}
      />
    </div>
  );
};

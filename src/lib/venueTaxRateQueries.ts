import { useMutation } from "convex/react";
import { api } from "./api";

// Set the tax rates charged at a venue (convex/lib/venueTaxRates.ts).
export const useSetVenueTaxRates = () =>
  useMutation(api.lib.venueTaxRates.setForVenue);

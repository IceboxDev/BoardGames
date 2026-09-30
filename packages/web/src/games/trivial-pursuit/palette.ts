import { parseComposedVariant, variantConfigForSlug } from "../match-variants";
import { type ArtsWedgeColor, TRIVIAL_PURSUIT_EDITIONS } from "./editions";

/**
 * The Art & Literature colour for a recorded match, read off the edition half
 * of its scenario ("Genus · German" → brown). Purple when no edition is
 * recorded — every box sold today prints it purple.
 */
export function artsWedgeForScenario(scenario: string | undefined): ArtsWedgeColor {
  const config = variantConfigForSlug("trivial-pursuit");
  const edition = config ? parseComposedVariant(scenario, config).primary : undefined;
  return TRIVIAL_PURSUIT_EDITIONS.find((e) => e.value === edition)?.artsWedge ?? "purple";
}

import type { Role } from "@boardgames/core/games/pandemic/types";
import contingencyPlannerUrl from "../assets/roles/contingency_planner.png";
import dispatcherUrl from "../assets/roles/dispatcher.png";
import medicUrl from "../assets/roles/medic.png";
import operationsExpertUrl from "../assets/roles/operations_expert.png";
import quarantineSpecialistUrl from "../assets/roles/quarantine_specialist.png";
import researcherUrl from "../assets/roles/researcher.png";
import scientistUrl from "../assets/roles/scientist.png";

export const PORTRAIT_URLS: Record<Role, string> = {
  medic: medicUrl,
  dispatcher: dispatcherUrl,
  researcher: researcherUrl,
  scientist: scientistUrl,
  contingency_planner: contingencyPlannerUrl,
  operations_expert: operationsExpertUrl,
  quarantine_specialist: quarantineSpecialistUrl,
};

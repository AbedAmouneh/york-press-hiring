// Which candidate sources a run uses. Sample data is for demos only: once any source has a real key,
// sources without a key are skipped instead of mixing made-up people into a real candidate list.
import { mock } from "../../env.js";
import { pdlProvider } from "./pdl.js";
import { signalhireProvider } from "./signalhire.js";
import type { CandidateSearchProvider } from "./types.js";

const isMock = (p: CandidateSearchProvider) => (p.name === "PDL" ? mock.pdl : mock.signalhire);

/** True when at least one candidate source is live, so the app is working with real people. */
export const liveSearch = () => !mock.pdl || !mock.signalhire;

/** The sources to search: every live one, or both in sample mode when none is set up. */
export function searchProviders(): CandidateSearchProvider[] {
  const all = [pdlProvider, signalhireProvider];
  return liveSearch() ? all.filter((p) => !isMock(p)) : all;
}

/** Sources left out of searches because they have no key while another source is live. */
export const skippedProviders = () => [pdlProvider, signalhireProvider].filter((p) => !searchProviders().includes(p));

/** Contact reveals: real ones need SignalHire; sample contacts are only allowed in a fully sample setup. */
export const revealAvailable = () => !mock.signalhire || !liveSearch();

export const providerLabel = (p: CandidateSearchProvider) => (p.name === "PDL" ? "People Data Labs" : "SignalHire");

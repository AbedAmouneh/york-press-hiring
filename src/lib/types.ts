import type { CandidateStatus, EducationItem, ExperienceItem, HmDecision, RequestStatus, Role, Weights } from "../../shared/types";

export type Me = { id: string; email: string; name: string; roles: Role[]; department: string | null; isDemo: boolean };

export type RequestRow = {
  id: string;
  code: string;
  title: string;
  department: string;
  seniority: string;
  headcount: number;
  startDate: string | null;
  kind: "new" | "backfill";
  jdText: string;
  mustHaves: string[];
  niceToHaves: string[];
  dealBreakers: string[];
  minYears: number | null;
  idealYears: number | null;
  languages: string[];
  locationPolicy: string;
  searchLocations: string[];
  timeZone: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  salaryPeriod: "year" | "month";
  justification: string;
  targetCompanies: string[];
  avoidCompanies: string[];
  requesterId: string;
  hiringManagerId: string | null;
  status: RequestStatus;
  scorecardWeights: Weights | null;
  applyToken: string;
  submittedAt: string | null;
  updatedAt: string;
  createdAt: string;
  requesterName: string | null;
  hiringManagerName: string | null;
  stats: { screened: number; contacted: number; hmYes: number; topAvg: number };
  lastEvent: { action: string; actorName: string; comment: string | null; createdAt: string } | null;
};

export type CandidateRow = {
  id: string;
  candidateId: string;
  rank: number | null;
  score: number | null;
  isTop10: boolean;
  newContender: boolean;
  status: CandidateStatus;
  hmDecision: HmDecision | null;
  fullName: string;
  headline: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  location: string | null;
  totalYears: number | null;
  sources: string[];
  isSample: boolean;
  hasEmail: boolean;
  email: string | null;
  linkedinUrl: string | null;
  redFlags: string | null;
  outreach: { channel: "email" | "linkedin"; status: string } | null;
};

export type CandidateDetail = {
  canEdit: boolean;
  isRecruiter: boolean;
  request: { id: string; title: string; scorecardWeights: Weights | null };
  roleCandidate: {
    id: string; rank: number | null; score: number | null; isTop10: boolean; scoreBreakdown: Partial<Weights> | null; dealBreakerMissing: boolean;
    whyRecommended: string | null; gaps: string | null; redFlags: string | null; relevantYears: number | null; webFindings: { finding: string; url: string }[] | null;
    status: CandidateStatus; hmDecision: HmDecision | null; hmComment: string | null; dateContacted: string | null; followUpDate: string | null; newContender: boolean; createdAt: string;
  };
  candidate: {
    id: string; fullName: string; headline: string | null; currentTitle: string | null; currentCompany: string | null; location: string | null;
    linkedinUrl: string | null; otherUrls: string[]; email: string | null; phone: string | null; hasEmail: boolean; contactSource: string | null; contactRetrievedAt: string | null;
    experience: ExperienceItem[]; education: EducationItem[]; skills: string[]; certifications: string[]; languages: string[]; totalYears: number | null;
    sources: string[]; openToWork: boolean | null; profileUpdatedAt: string | null; isSample: boolean;
  };
  messages: { id: string; channel: "email" | "linkedin"; status: string; subject: string | null; body: string; toAddress: string; queuedAt: string; sentAt: string | null }[];
  reveals: { id: string; status: string; requestedAt: string }[];
  otherRoles: { id: string; title: string; status: string; score: number | null }[];
  applications: { id: string; createdAt: string; cvFileName: string; score: number | null }[];
};

// "Client Added" resolution.
//
// When a company has an explicit engagement date ("Client since"), that date is
// authoritative and must not be replaced by older task/project start dates.
// Without it we fall back to the profile creation date and let the caller take
// the earliest known date.
export type ClientAddedDate = {
  value?: string;
  /** True when the value comes from "Client since" and must win outright. */
  pinned: boolean;
};

export const resolveClientAddedDate = (
  clientSince?: string,
  fallbackCreatedAt?: string,
): ClientAddedDate => (
  clientSince ? { value: clientSince, pinned: true } : { value: fallbackCreatedAt, pinned: false }
);

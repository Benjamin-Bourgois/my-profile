import { splitTableLabel } from "@/lib/style";

/** Badge « TABLE 12 » : petit bloc noir mat, numéro en serif. */
export function TableBadge({ label }: { label: string }) {
  const { label: word, value } = splitTableLabel(label);
  return (
    <span className="table-badge" aria-label={label}>
      {word ? <small>{word}</small> : null}
      <b className={word ? "" : "!mt-0 !text-xl"}>{value}</b>
    </span>
  );
}

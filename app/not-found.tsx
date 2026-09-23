import Link from "next/link";

export default function NotFound() {
  return <section className="shell content-section"><div className="panel message-placeholder"><strong>Patch series not found.</strong><Link className="text-link" href="/">Return to patchsets</Link></div></section>;
}

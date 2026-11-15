import { Link } from "react-router";
import { PageTitle } from "../components/ui";
import { useMe } from "../hooks";

const link = "text-gold underline hover:text-parchment";

/**
 * An address that leads nowhere (#907): says so, and offers the ways on. Signed
 * in, the person's characters and troupes; signed out, signing in. Help either way.
 */
export function NotFoundPage() {
  const signedIn = !!useMe().data;
  return (
    <>
      <PageTitle>Nothing here</PageTitle>
      <p className="text-mist">There is no page at this address: the link may be wrong, or the page may have gone.</p>
      <nav aria-label="Ways on" className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        {signedIn ? (
          <>
            <Link to="/characters" className={link}>
              Characters
            </Link>
            <Link to="/troupes" className={link}>
              Troupes
            </Link>
          </>
        ) : (
          <Link to="/sign-in" className={link}>
            Sign in
          </Link>
        )}
        <Link to="/help" className={link}>
          Help
        </Link>
      </nav>
    </>
  );
}

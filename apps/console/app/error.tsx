"use client";

import { Button } from "../components/Button";
import { ERROR_CODES } from "../lib/errors";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty">
      <p>
        Something went wrong · <code>{ERROR_CODES.NOT_IMPLEMENTED}</code>
      </p>
      <Button variant="primary" onClick={reset}>
        Reload
      </Button>
    </div>
  );
}

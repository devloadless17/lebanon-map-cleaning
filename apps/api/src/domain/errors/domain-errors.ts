/**
 * Errors the application raises on purpose, each carrying a message written for a scheduler.
 *
 * Provider failures are translated into these at the infrastructure boundary and never escape
 * as themselves — "ROUTE_OPTIMIZATION_ERROR_422" must never reach a user's screen.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly status: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class RoutingUnavailableError extends DomainError {
  readonly code = 'ROUTING_UNAVAILABLE';
  readonly status = 503;
  constructor() {
    super(
      'We could not calculate travel times just now, so distances are rough estimates. ' +
        'Try again in a moment.',
    );
  }
}

export class GeocodingFailedError extends DomainError {
  readonly code = 'GEOCODING_FAILED';
  readonly status = 422;
  constructor(message = 'We could not find that location. Try dropping a pin on the map instead.') {
    super(message);
  }
}

export class NoFeasibleSlotError extends DomainError {
  readonly code = 'NO_FEASIBLE_SLOT';
  readonly status = 409;
  constructor(message = 'No time on this day fits within the customer’s availability.') {
    super(message);
  }
}

export class AppointmentConflictError extends DomainError {
  readonly code = 'APPOINTMENT_CONFLICT';
  readonly status = 409;
  constructor(message = 'That time overlaps another appointment. The team can only be in one place.') {
    super(message);
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly status = 404;
  constructor(what: string) {
    super(`${what} could not be found.`);
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
  readonly status = 400;
  constructor(message: string) {
    super(message);
  }
}

export class UnauthorizedError extends DomainError {
  readonly code = 'UNAUTHORIZED';
  readonly status = 401;
  constructor(message = 'Please sign in to continue.') {
    super(message);
  }
}

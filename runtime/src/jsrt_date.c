/* jsrt_date.c — `Date`, slice A: the TZ-INDEPENDENT core (plan.md §7 Task 4.2).
 *
 * A Date is one double: milliseconds since 1970-01-01T00:00:00Z, or NaN for an Invalid Date. Every
 * operation here is a pure function of that double, which is exactly what makes this slice
 * testable by ordinary golden tests — no clock is read, no timezone database is consulted, and the
 * output on any machine is the output on the pinned Node. The local-time half (`getHours` and its
 * siblings, `getTimezoneOffset`) is slice B, and `Date.now`/`new Date()` read a clock and land
 * under the determinism carve-out. `toString`/`toLocale*` need CLDR names and belong to the intl
 * feature build (Task 4.4).
 *
 * The calendar arithmetic is Howard Hinnant's `days_from_civil`/`civil_from_days` (the algorithms
 * behind C++20's <chrono>), which are exact over the proleptic Gregorian calendar for every year a
 * time value can reach. ECMA-262 §21.4.1 defines the same calendar, so this is a translation
 * rather than an approximation: 1900 is not a leap year here, 2000 is, and year 0 exists.
 */

#include "jsrt_value.h"

#include "jsrt.h"

#include <math.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

const JSRTClass jsrt_class_date = {"Date", 0, NULL, NULL, 0, NULL};

#define MS_PER_SECOND 1000.0
#define MS_PER_MINUTE 60000.0
#define MS_PER_HOUR 3600000.0
#define MS_PER_DAY 86400000.0

/* §21.4.1.1: the largest time value is 100,000,000 days either side of the epoch. A value outside
 * it is not a clamped date, it is an Invalid Date -- `new Date(8.64e15 + 1).getTime()` is NaN. */
#define MAX_TIME_VALUE 8.64e15

/* TimeClip (§21.4.1.31): a time value is an INTEGER number of milliseconds in range, or NaN.
 * `trunc` rather than `floor` because the spec truncates toward zero, which differs for a
 * fractional negative time. */
static double time_clip(double t) {
  if (!isfinite(t) || fabs(t) > MAX_TIME_VALUE) {
    return NAN;
  }
  /* `+0.0` normalizes a -0 result: the spec's ToIntegerOrInfinity gives +0, and -0 would print as
   * "-0" through the number formatter. */
  return trunc(t) + 0.0;
}

/* Floored division and modulo -- C's `/` and `fmod` truncate toward zero, which puts a pre-epoch
 * time in the wrong day. `floor(-1 / 86400000)` is the day BEFORE the epoch, which is what a
 * negative time value means. */
static double floor_div(double a, double b) { return floor(a / b); }

static double floor_mod(double a, double b) { return a - floor_div(a, b) * b; }

/* Days since 1970-01-01 from a proleptic Gregorian y/m/d (Hinnant). `m` is 1..12 and `d` is 1..31;
 * out-of-range values are the CALLER's to normalize, which is what MakeDay does. */
static double days_from_civil(double y, double m, double d) {
  y -= m <= 2 ? 1 : 0;
  const double era = floor_div(y, 400);
  const double yoe = y - era * 400;                                          /* [0, 399] */
  const double doy = floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;  /* [0, 365] */
  const double doe = yoe * 365 + floor(yoe / 4) - floor(yoe / 100) + doy;    /* [0, 146096] */
  return era * 146097 + doe - 719468;
}

typedef struct {
  double year;
  double month; /* 1..12 */
  double day;   /* 1..31 */
} Civil;

static Civil civil_from_days(double z) {
  z += 719468;
  const double era = floor_div(z, 146097);
  const double doe = z - era * 146097;                                               /* [0, 146096] */
  const double yoe = floor((doe - floor(doe / 1460) + floor(doe / 36524) - floor(doe / 146096)) / 365);
  const double y = yoe + era * 400;
  const double doy = doe - (365 * yoe + floor(yoe / 4) - floor(yoe / 100));          /* [0, 365] */
  const double mp = floor((5 * doy + 2) / 153);                                      /* [0, 11] */
  const double d = doy - floor((153 * mp + 2) / 5) + 1;                              /* [1, 31] */
  const double m = mp + (mp < 10 ? 3 : -9);                                          /* [1, 12] */
  Civil out = {y + (m <= 2 ? 1 : 0), m, d};
  return out;
}

/* ============================================================================
 * Construction and the time value
 * ============================================================================ */

static JSRTDate *as_date(jsrt_value v) {
  if (!jsrt_is_date(v)) {
    jsrt_panic("STA4093: a Date operation on a value that is not a Date");
  }
  return (JSRTDate *)jsrt_ptr(v);
}

jsrt_value jsrt_date_new(double time) {
  JSRTDate *d = (JSRTDate *)jsrt_gc_alloc(sizeof(JSRTDate), "date");
  d->cls = &jsrt_class_date;
  d->time = time_clip(time);
  return JSRT_BOX(JSRT_TAG_OBJECT, (uintptr_t)d);
}

/* The one member of this file that is not a pure function of its input, and the reason `Date.now`
 * and zero-argument `new Date()` prove through the determinism carve-out rather than a golden
 * test. CLOCK_REALTIME, not CLOCK_MONOTONIC: §21.4.3.1 asks for the time since the epoch, which is
 * the wall clock -- a monotonic clock's origin is unspecified. The spec's answer is a whole number
 * of milliseconds, so the sub-millisecond remainder is truncated rather than rounded. */
double jsrt_date_now_ms(void) {
  struct timespec ts;
  if (clock_gettime(CLOCK_REALTIME, &ts) != 0) {
    return NAN;
  }
  return trunc((double)ts.tv_sec * MS_PER_SECOND + (double)ts.tv_nsec / 1000000.0);
}

jsrt_value jsrt_date_now(void) { return jsrt_number(jsrt_date_now_ms()); }

double jsrt_date_value(jsrt_value v) { return as_date(v)->time; }

jsrt_value jsrt_date_get_time(jsrt_value v) { return jsrt_number(as_date(v)->time); }

jsrt_value jsrt_date_set_time(jsrt_value v, jsrt_value ms) {
  JSRTDate *d = as_date(v);
  d->time = time_clip(jsrt_to_number(ms));
  return jsrt_number(d->time);
}

/* ============================================================================
 * The UTC field getters (§21.4.4.x)
 * ============================================================================
 *
 * Every one answers NaN for an Invalid Date -- the spec's "If t is NaN, return NaN" -- which is
 * why the NaN check is here once rather than in eight places. */

typedef enum {
  F_FULL_YEAR,
  F_MONTH,
  F_DATE,
  F_DAY,
  F_HOURS,
  F_MINUTES,
  F_SECONDS,
  F_MILLISECONDS
} DateField;

static double field_of(double t, DateField which) {
  if (isnan(t)) {
    return NAN;
  }
  const double day = floor_div(t, MS_PER_DAY);
  switch (which) {
    case F_FULL_YEAR:
      return civil_from_days(day).year;
    case F_MONTH:
      /* Zero-based, as the language exposes it: `getUTCMonth()` of a January date is 0. */
      return civil_from_days(day).month - 1;
    case F_DATE:
      return civil_from_days(day).day;
    case F_DAY:
      /* 1970-01-01 was a Thursday, so the epoch day is weekday 4. */
      return floor_mod(day + 4, 7);
    case F_HOURS:
      return floor_mod(floor_div(t, MS_PER_HOUR), 24);
    case F_MINUTES:
      return floor_mod(floor_div(t, MS_PER_MINUTE), 60);
    case F_SECONDS:
      return floor_mod(floor_div(t, MS_PER_SECOND), 60);
    case F_MILLISECONDS:
      return floor_mod(t, MS_PER_SECOND);
  }
  jsrt_panic("STA4085: a Date field the runtime does not know");
}

#define DATE_GETTER(name, field)                                                                   \
  jsrt_value jsrt_date_get_##name(jsrt_value v) { return jsrt_number(field_of(as_date(v)->time, field)); }

DATE_GETTER(utc_full_year, F_FULL_YEAR)
DATE_GETTER(utc_month, F_MONTH)
DATE_GETTER(utc_date, F_DATE)
DATE_GETTER(utc_day, F_DAY)
DATE_GETTER(utc_hours, F_HOURS)
DATE_GETTER(utc_minutes, F_MINUTES)
DATE_GETTER(utc_seconds, F_SECONDS)
DATE_GETTER(utc_milliseconds, F_MILLISECONDS)

/* ============================================================================
 * MakeDay / MakeTime / MakeDate (§21.4.1.27-29), which the setters and Date.UTC share
 * ============================================================================ */

/* The spec normalizes out-of-range components rather than rejecting them: month 12 is January of
 * the next year, day 0 is the last day of the previous month, hour 25 is 1am tomorrow. That falls
 * out of the arithmetic here for free, which is why `Date.UTC(2024, 12, 0)` is a date and not an
 * error. */
static double make_day(double year, double month, double day) {
  if (!isfinite(year) || !isfinite(month) || !isfinite(day)) {
    return NAN;
  }
  year = trunc(year);
  month = trunc(month);
  day = trunc(day);
  const double ym = year + floor_div(month, 12);
  const double mn = floor_mod(month, 12);
  return days_from_civil(ym, mn + 1, 1) + day - 1;
}

static double make_time(double h, double m, double s, double ms) {
  if (!isfinite(h) || !isfinite(m) || !isfinite(s) || !isfinite(ms)) {
    return NAN;
  }
  return trunc(h) * MS_PER_HOUR + trunc(m) * MS_PER_MINUTE + trunc(s) * MS_PER_SECOND + trunc(ms);
}

static double make_date(double day, double time) {
  if (!isfinite(day) || !isfinite(time)) {
    return NAN;
  }
  return day * MS_PER_DAY + time;
}

/* Date.UTC (§21.4.3.4). The spec's defaults are month 0, day 1, and zero for the rest; a missing
 * YEAR makes the result NaN, which is what `jsrt_to_number(JSRT_UNDEFINED)` already answers. */
jsrt_value jsrt_date_utc(jsrt_value year, jsrt_value month, jsrt_value day, jsrt_value hours,
                        jsrt_value minutes, jsrt_value seconds, jsrt_value ms) {
  const double y = jsrt_to_number(year);
  const double mo = month == JSRT_UNDEFINED ? 0 : jsrt_to_number(month);
  const double d = day == JSRT_UNDEFINED ? 1 : jsrt_to_number(day);
  const double h = hours == JSRT_UNDEFINED ? 0 : jsrt_to_number(hours);
  const double mi = minutes == JSRT_UNDEFINED ? 0 : jsrt_to_number(minutes);
  const double s = seconds == JSRT_UNDEFINED ? 0 : jsrt_to_number(seconds);
  const double milli = ms == JSRT_UNDEFINED ? 0 : jsrt_to_number(ms);
  /* §21.4.3.4 step 8: a two-digit year means 19xx, and ONLY here and in the local constructor --
   * `new Date(95, 0)` is 1995, `new Date(Date.UTC(95, 0))` is too, but `setUTCFullYear(95)` is 95. */
  const double yr = !isnan(y) && trunc(y) >= 0 && trunc(y) <= 99 ? 1900 + trunc(y) : y;
  return jsrt_number(time_clip(make_date(make_day(yr, mo, d), make_time(h, mi, s, milli))));
}

/* ============================================================================
 * The UTC field setters (§21.4.4.2x)
 * ============================================================================ */

/* Every setter rebuilds the time value from the fields it is NOT changing, which is what makes
 * `setUTCMonth(13)` roll into the next year rather than clamping. A setter on an Invalid Date
 * stays invalid except `setTime`, the only one that does not read the old value. */
static jsrt_value set_fields(jsrt_value v, DateField first, const double *values, size_t count) {
  JSRTDate *d = as_date(v);
  const double t = d->time;
  double part[8];
  for (size_t i = 0; i < 8; i++) {
    part[i] = field_of(t, (DateField)i);
  }
  for (size_t i = 0; i < count; i++) {
    part[(size_t)first + i] = values[i];
  }
  /* Setting the year on an Invalid Date is the one case that RECOVERS: §21.4.4.21 substitutes +0
   * for the NaN fields rather than propagating, so `new Date(NaN).setUTCFullYear(2024)` is a date. */
  if (isnan(t)) {
    if (first != F_FULL_YEAR) {
      return jsrt_number(NAN);
    }
    for (size_t i = 0; i < 8; i++) {
      if (isnan(part[i])) {
        part[i] = i == F_DATE ? 1 : 0;
      }
    }
  }
  const double day = make_day(part[F_FULL_YEAR], part[F_MONTH], part[F_DATE]);
  const double time =
      make_time(part[F_HOURS], part[F_MINUTES], part[F_SECONDS], part[F_MILLISECONDS]);
  d->time = time_clip(make_date(day, time));
  return jsrt_number(d->time);
}

/* The setters take their optional trailing components as `undefined`, which reads as "keep the
 * current value" -- the spec's own wording, since each step is conditional on the argument being
 * present. `jsrt_to_number(undefined)` is NaN, so absence is checked rather than converted. */
static double or_current(jsrt_value given, double current) {
  return given == JSRT_UNDEFINED ? current : jsrt_to_number(given);
}

jsrt_value jsrt_date_set_utc_milliseconds(jsrt_value v, jsrt_value ms) {
  const double values[1] = {jsrt_to_number(ms)};
  return set_fields(v, F_MILLISECONDS, values, 1);
}

jsrt_value jsrt_date_set_utc_seconds(jsrt_value v, jsrt_value s, jsrt_value ms) {
  const double t = as_date(v)->time;
  const double values[2] = {jsrt_to_number(s), or_current(ms, field_of(t, F_MILLISECONDS))};
  return set_fields(v, F_SECONDS, values, 2);
}

jsrt_value jsrt_date_set_utc_minutes(jsrt_value v, jsrt_value mi, jsrt_value s, jsrt_value ms) {
  const double t = as_date(v)->time;
  const double values[3] = {jsrt_to_number(mi), or_current(s, field_of(t, F_SECONDS)),
                            or_current(ms, field_of(t, F_MILLISECONDS))};
  return set_fields(v, F_MINUTES, values, 3);
}

jsrt_value jsrt_date_set_utc_hours(jsrt_value v, jsrt_value h, jsrt_value mi, jsrt_value s,
                                   jsrt_value ms) {
  const double t = as_date(v)->time;
  const double values[4] = {jsrt_to_number(h), or_current(mi, field_of(t, F_MINUTES)),
                            or_current(s, field_of(t, F_SECONDS)),
                            or_current(ms, field_of(t, F_MILLISECONDS))};
  return set_fields(v, F_HOURS, values, 4);
}

jsrt_value jsrt_date_set_utc_date(jsrt_value v, jsrt_value day) {
  const double values[1] = {jsrt_to_number(day)};
  return set_fields(v, F_DATE, values, 1);
}

jsrt_value jsrt_date_set_utc_month(jsrt_value v, jsrt_value month, jsrt_value day) {
  const double t = as_date(v)->time;
  const double values[2] = {jsrt_to_number(month), or_current(day, field_of(t, F_DATE))};
  return set_fields(v, F_MONTH, values, 2);
}

jsrt_value jsrt_date_set_utc_full_year(jsrt_value v, jsrt_value year, jsrt_value month,
                                       jsrt_value day) {
  const double t = as_date(v)->time;
  /* On an Invalid Date the "current" month and day are NaN; set_fields substitutes the spec's
   * defaults for them, so reading them here is safe rather than load-bearing. */
  const double values[3] = {jsrt_to_number(year), or_current(month, field_of(t, F_MONTH)),
                            or_current(day, field_of(t, F_DATE))};
  return set_fields(v, F_FULL_YEAR, values, 3);
}

/* ============================================================================
 * The string forms that do not need a locale
 * ============================================================================ */

/* §21.4.1.33's expanded year: four digits inside [0, 9999], and a SIGNED six-digit form outside it
 * -- `+275760-09-13T00:00:00.000Z` and `-000001-01-01T00:00:00.000Z`, both of which Node prints. */
static void write_iso(char *out, size_t n, double t) {
  const double day = floor_div(t, MS_PER_DAY);
  const Civil c = civil_from_days(day);
  char year[10];
  if (c.year >= 0 && c.year <= 9999) {
    snprintf(year, sizeof year, "%04d", (int)c.year);
  } else {
    snprintf(year, sizeof year, "%c%06d", c.year < 0 ? '-' : '+', (int)fabs(c.year));
  }
  snprintf(out, n, "%s-%02d-%02dT%02d:%02d:%02d.%03dZ", year, (int)c.month, (int)c.day,
           (int)floor_mod(floor_div(t, MS_PER_HOUR), 24),
           (int)floor_mod(floor_div(t, MS_PER_MINUTE), 60),
           (int)floor_mod(floor_div(t, MS_PER_SECOND), 60), (int)floor_mod(t, MS_PER_SECOND));
}

jsrt_value jsrt_date_to_iso_string(jsrt_value v) {
  const double t = as_date(v)->time;
  /* §21.4.4.36 throws a RangeError here. The runtime cannot raise one until Phase 5 step 11 gives
   * it a catch around user code (plan-notes 125), so this aborts loudly rather than answering with
   * a string no Date has -- the STA2005 pattern JSON.stringify already uses for a cycle. */
  if (isnan(t)) {
    jsrt_panic("STA2005: toISOString on an Invalid Date throws a RangeError, which the runtime "
               "cannot raise yet");
  }
  char text[40];
  write_iso(text, sizeof text, t);
  return jsrt_string_from_utf8(text, strlen(text));
}

/* toJSON (§21.4.4.37) is NOT toISOString: it answers `null` for a non-finite time value rather than
 * throwing, which is what makes `JSON.stringify(new Date(NaN))` the string "null". */
jsrt_value jsrt_date_to_json(jsrt_value v) {
  const double t = as_date(v)->time;
  if (isnan(t)) {
    return JSRT_NULL;
  }
  char text[40];
  write_iso(text, sizeof text, t);
  return jsrt_string_from_utf8(text, strlen(text));
}

/* toUTCString (§21.4.4.43): `Thu, 29 Feb 2024 13:45:06 GMT`. The day and month names are the
 * spec's own ASCII abbreviations, not locale data -- which is exactly why this one is in slice A
 * while `toString` and `toLocaleDateString` are the intl feature build's. */
jsrt_value jsrt_date_to_utc_string(jsrt_value v) {
  static const char *const DAYS[7] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
  static const char *const MONTHS[12] = {"Jan", "Feb", "Mar", "Apr", "May", "Jun",
                                         "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};
  const double t = as_date(v)->time;
  if (isnan(t)) {
    return jsrt_string_from_utf8("Invalid Date", 12);
  }
  const double day = floor_div(t, MS_PER_DAY);
  const Civil c = civil_from_days(day);
  char text[64];
  /* The year is padded to four digits and signed below zero, the same rule toISOString follows;
   * Node prints `Sat, 01 Jan -000001 00:00:00 GMT` for a negative year. */
  char year[10];
  if (c.year >= 0) {
    snprintf(year, sizeof year, "%04d", (int)c.year);
  } else {
    snprintf(year, sizeof year, "-%06d", (int)fabs(c.year));
  }
  snprintf(text, sizeof text, "%s, %02d %s %s %02d:%02d:%02d GMT",
           DAYS[(size_t)floor_mod(day + 4, 7)], (int)c.day, MONTHS[(size_t)c.month - 1], year,
           (int)floor_mod(floor_div(t, MS_PER_HOUR), 24),
           (int)floor_mod(floor_div(t, MS_PER_MINUTE), 60),
           (int)floor_mod(floor_div(t, MS_PER_SECOND), 60));
  return jsrt_string_from_utf8(text, strlen(text));
}

/* ============================================================================
 * Date.parse, ISO 8601 only
 * ============================================================================ */

/* §21.4.3.2 lets an implementation accept other formats; this accepts exactly the Date Time String
 * Format of §21.4.1.32 and answers NaN for everything else. Guessing at Node's fallback parser
 * (which is V8's, and is not specified anywhere) would produce dates that differ from Node for
 * inputs no test could enumerate -- so an unparseable string is honestly Invalid.
 *
 * A DATE-ONLY form is UTC; a date-time form without an offset is LOCAL by the spec, but slice A is
 * the TZ-independent core, so a missing offset is refused here rather than read against a timezone
 * this slice does not have. Slice B lifts that. */
static bool digits(const char *s, size_t n, double *out) {
  double value = 0;
  for (size_t i = 0; i < n; i++) {
    if (s[i] < '0' || s[i] > '9') {
      return false;
    }
    value = value * 10 + (s[i] - '0');
  }
  *out = value;
  return true;
}

static double parse_iso(const char *s, size_t len) {
  size_t i = 0;
  double sign = 1;
  double year = 0;
  if (len >= 7 && (s[0] == '+' || s[0] == '-')) {
    sign = s[0] == '-' ? -1 : 1;
    if (!digits(s + 1, 6, &year)) {
      return NAN;
    }
    i = 7;
  } else if (len >= 4 && digits(s, 4, &year)) {
    i = 4;
  } else {
    return NAN;
  }
  year *= sign;
  double month = 1;
  double day = 1;
  if (i + 3 <= len && s[i] == '-') {
    if (!digits(s + i + 1, 2, &month)) {
      return NAN;
    }
    i += 3;
    if (i + 3 <= len && s[i] == '-') {
      if (!digits(s + i + 1, 2, &day)) {
        return NAN;
      }
      i += 3;
    }
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return NAN;
  }
  double hour = 0;
  double minute = 0;
  double second = 0;
  double milli = 0;
  bool has_time = false;
  if (i < len && (s[i] == 'T' || s[i] == 't')) {
    has_time = true;
    i++;
    if (i + 5 > len || !digits(s + i, 2, &hour) || s[i + 2] != ':' ||
        !digits(s + i + 3, 2, &minute)) {
      return NAN;
    }
    i += 5;
    if (i + 3 <= len && s[i] == ':') {
      if (!digits(s + i + 1, 2, &second)) {
        return NAN;
      }
      i += 3;
      if (i + 4 <= len && s[i] == '.') {
        if (!digits(s + i + 1, 3, &milli)) {
          return NAN;
        }
        i += 4;
      }
    }
  }
  double offset = 0;
  if (i < len && (s[i] == 'Z' || s[i] == 'z')) {
    i++;
  } else if (i < len && (s[i] == '+' || s[i] == '-')) {
    const double osign = s[i] == '-' ? -1 : 1;
    double oh = 0;
    double om = 0;
    if (i + 6 > len || !digits(s + i + 1, 2, &oh) || s[i + 3] != ':' ||
        !digits(s + i + 4, 2, &om)) {
      return NAN;
    }
    offset = osign * (oh * MS_PER_HOUR + om * MS_PER_MINUTE);
    i += 6;
  } else if (has_time) {
    /* A date-time with no offset is LOCAL time by §21.4.3.2, which slice A cannot resolve. */
    return NAN;
  }
  if (i != len || hour > 24 || minute > 59 || second > 59) {
    return NAN;
  }
  const double t = make_date(make_day(year, month - 1, day), make_time(hour, minute, second, milli));
  return time_clip(t - offset);
}

/* The ISO grammar is entirely ASCII, so a string is copied down to bytes and anything wider than
 * one is unparseable by construction -- which saves the parser from thinking about UTF-16 at all.
 * `ASCII_MAX` is well past the longest legal form (`+275760-09-13T00:00:00.000+00:00` is 32). */
#define ASCII_MAX 64

static bool to_ascii(jsrt_value text, char *out, size_t *len) {
  const uint32_t n = jsrt_string_length(text);
  if (n >= ASCII_MAX) {
    return false;
  }
  for (uint32_t i = 0; i < n; i++) {
    const uint16_t unit = jsrt_string_char(text, i);
    if (unit > 127) {
      return false;
    }
    out[i] = (char)unit;
  }
  *len = n;
  return true;
}

jsrt_value jsrt_date_parse(jsrt_value text) {
  char ascii[ASCII_MAX];
  size_t len = 0;
  if (!jsrt_is(text, JSRT_TAG_STRING) || !to_ascii(text, ascii, &len)) {
    return jsrt_number(NAN);
  }
  return jsrt_number(parse_iso(ascii, len));
}

/* `new Date(x)` where x is not a number: the spec converts a string through Date.parse and
 * anything else through ToNumber. A Date argument copies its time value. */
jsrt_value jsrt_date_from_value(jsrt_value v) {
  if (jsrt_is_date(v)) {
    return jsrt_date_new(as_date(v)->time);
  }
  if (jsrt_is(v, JSRT_TAG_STRING)) {
    char ascii[ASCII_MAX];
    size_t len = 0;
    return jsrt_date_new(to_ascii(v, ascii, &len) ? parse_iso(ascii, len) : NAN);
  }
  return jsrt_date_new(jsrt_to_number(v));
}

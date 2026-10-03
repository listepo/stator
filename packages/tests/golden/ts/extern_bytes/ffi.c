// `Uint8Array` parameters (docs/FFI.md section 2, plan.md section 11c T11.3a): each view arrives
// as its own bytes plus its length, two C arguments for one TS parameter, with no forward
// declaration but the emitter's (`uint8_t *, size_t`). Writes land in the caller's buffer, and
// `bytes_calls` counts the crossings so the golden can show that a megabyte is ONE call.
#include <stddef.h>
#include <stdint.h>

static double calls;

double bytes_calls(void) {
  return calls;
}

double bytes_fill(uint8_t *data, size_t length, double value) {
  calls += 1;
  for (size_t i = 0; i < length; i++) {
    data[i] = (uint8_t)value;
  }
  return (double)length;
}

double bytes_sum(uint8_t *data, size_t length) {
  calls += 1;
  double sum = 0;
  for (size_t i = 0; i < length; i++) {
    sum += data[i];
  }
  return sum;
}

void bytes_reverse(uint8_t *data, size_t length) {
  calls += 1;
  for (size_t i = 0; i + 1 < length - i; i++) {
    uint8_t byte = data[i];
    data[i] = data[length - 1 - i];
    data[length - 1 - i] = byte;
  }
}

double bytes_equal(uint8_t *a, size_t a_length, uint8_t *b, size_t b_length) {
  calls += 1;
  if (a_length != b_length) {
    return 0;
  }
  for (size_t i = 0; i < a_length; i++) {
    if (a[i] != b[i]) {
      return 0;
    }
  }
  return 1;
}

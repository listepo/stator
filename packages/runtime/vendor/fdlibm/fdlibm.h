/* Entry points of the vendored fdlibm (see fdlibm.c for provenance).
 * Names are fdlibm_-prefixed so they never bind to the host libm. */
#ifndef JSRT_VENDOR_FDLIBM_H
#define JSRT_VENDOR_FDLIBM_H

double fdlibm_acos(double x);
double fdlibm_acosh(double x);
double fdlibm_asin(double x);
double fdlibm_asinh(double x);
double fdlibm_atan(double x);
double fdlibm_atan2(double y, double x);
double fdlibm_atanh(double x);
double fdlibm_cbrt(double x);
double fdlibm_cos(double x);
double fdlibm_cosh(double x);
double fdlibm_exp(double x);
double fdlibm_expm1(double x);
double fdlibm_log(double x);
double fdlibm_log10(double x);
double fdlibm_log1p(double x);
double fdlibm_log2(double x);
double fdlibm_pow(double x, double y);
double fdlibm_sin(double x);
double fdlibm_sinh(double x);
double fdlibm_tan(double x);
double fdlibm_tanh(double x);

#endif /* JSRT_VENDOR_FDLIBM_H */

try {
  console.log(new Date(NaN).toISOString());
} catch {
  console.log("threw");
}

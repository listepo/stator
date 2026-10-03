// An attributed package import (plan.md §11d T12.3): the attributes travel to the vendor entry,
// and the bundler inlines the JSON.
import data from 'conf/data.json' with { type: 'json' };
console.log(data.name, data.size);

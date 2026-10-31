# Project rules

- Production and preview build scripts give Node an 8 GiB heap ceiling because the full application bundle exceeds the default heap during Nitro bundling; this affects build tooling only, not the deployed Worker runtime.
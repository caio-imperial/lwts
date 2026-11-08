package main

import (
	"fmt"
	"os"

	"github.com/oceanplexian/lwts/server/internal/db"
)

// closeDS closes the datasource and reports a close failure on stderr instead
// of discarding it. Use it as `defer closeDS(ds)`.
func closeDS(ds db.Datasource) {
	if err := ds.Close(); err != nil {
		fmt.Fprintf(os.Stderr, "close db: %v\n", err)
	}
}

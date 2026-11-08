package slug

import (
	"strings"
	"testing"
)

func TestNormalize(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"simple", "My Board", "my-board"},
		{"hash and digit", "Meu Board #1", "meu-board-1"},
		{"accents removed", "Ação & Cia", "acao-cia"},
		{"symbols only", "  --  ", "board"},
		{"reserved word", "settings", "board-settings"},
		{"default is not reserved", "Default", "default"},
		{"emoji only", "🔥🔥", "board"},
		{"empty", "", "board"},
		{"repeated separators", "My -- Board", "my-board"},
		{"leading and trailing separators", " -Hello- ", "hello"},
		{"uppercase and spaces", "  QA BOARD  ", "qa-board"},
		{"long name capped at 60", strings.Repeat("a", 80), strings.Repeat("a", 60)},
		{"long name with dashes capped", strings.Repeat("ab ", 30), strings.Repeat("ab-", 19) + "ab"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Normalize(tt.in); got != tt.want {
				t.Errorf("Normalize(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestNormalizeMaxLength(t *testing.T) {
	for _, in := range []string{
		strings.Repeat("x", 200),
		"aÇÃO " + strings.Repeat("ç", 100),
		strings.Repeat("settings ", 20),
	} {
		got := Normalize(in)
		if len(got) > maxLen {
			t.Errorf("Normalize(%q) length = %d, want <= %d", in, len(got), maxLen)
		}
		if strings.HasSuffix(got, "-") {
			t.Errorf("Normalize(%q) = %q must not end with a dash", in, got)
		}
	}
}

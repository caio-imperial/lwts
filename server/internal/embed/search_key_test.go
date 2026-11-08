package embed

import "testing"

func TestLooksLikeKey(t *testing.T) {
	tests := []struct {
		value string
		want  bool
	}{
		{"FNAI-16", true},
		{"kanb-7", true},
		{"MY-BOA-3", true},
		{"my-boa-3", true},
		{"  MY-BOA-3  ", true},
		{"MY-BOA", false},
		{"123", false},
		{"FNAI-", false},
		{"FNAI-16 extra", false},
		{"", false},
	}

	for _, tt := range tests {
		if got := LooksLikeKey(tt.value); got != tt.want {
			t.Errorf("LooksLikeKey(%q) = %v, want %v", tt.value, got, tt.want)
		}
	}
}

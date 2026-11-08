package card

import "testing"

func TestLooksLikeKey(t *testing.T) {
	tests := []struct {
		value string
		want  bool
	}{
		{"LWTS-1", true},
		{"MY-BOA-7", true},
		{"my-boa-7", true},
		{"FNAI-245", true},
		{"MY-BOA", false},
		{"not-a-key", false},
		{"123", false},
		{"MY-BOA-", false},
		{"", false},
	}

	for _, tt := range tests {
		if got := looksLikeKey(tt.value); got != tt.want {
			t.Errorf("looksLikeKey(%q) = %v, want %v", tt.value, got, tt.want)
		}
	}
}

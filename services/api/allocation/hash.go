package allocation

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"strconv"
)

const Buckets = 1_000_000

func canonical(projectID int, salt, kind, id string) []byte {
	return []byte("aperture:gate:v1\x00" + strconv.Itoa(projectID) + "\x00" + salt + "\x00" + kind + "\x00" + id)
}

// Bucket returns a stable bucket in [0, 999999]. The byte format is versioned
// so future local evaluators can share exact test vectors with the API.
func Bucket(projectID int, salt, kind, id string) int {
	sum := sha256.Sum256(canonical(projectID, salt, kind, id))
	return int(binary.BigEndian.Uint64(sum[:8]) % Buckets)
}

// IdentityHash creates the pseudonymous key stored in gate telemetry. Raw
// allocation IDs are used for evaluation and then discarded.
func IdentityHash(secret, kind, id string) string {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte("aperture:identity:v1\x00" + kind + "\x00" + id))
	return hex.EncodeToString(h.Sum(nil))
}

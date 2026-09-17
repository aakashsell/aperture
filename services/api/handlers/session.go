package handlers

import (
	"aperture/api/auth"
	"aperture/api/db"
	"github.com/gofiber/fiber/v2"
	"os"
	"strings"
	"time"
)

func Session(c *fiber.Ctx) error {
	var email, name, key string
	err := db.Pool.QueryRow(c.Context(), `SELECT u.email,p.name,p.api_key FROM users u JOIN projects p ON p.owner_id=u.id WHERE u.id=$1 AND p.id=$2`, auth.UserID(c), auth.ProjectID(c)).Scan(&email, &name, &key)
	if err != nil {
		return fiber.NewError(500, "Unable to load project")
	}
	return c.JSON(fiber.Map{"email": email, "project_name": name, "publishable_key": key})
}
func Login(c *fiber.Ctx) error    { return credentials(c, false) }
func Register(c *fiber.Ctx) error { return credentials(c, true) }
func credentials(c *fiber.Ctx, register bool) error {
	var b struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Project  string `json:"project"`
	}
	if c.BodyParser(&b) != nil {
		return fiber.NewError(400, "Invalid request")
	}
	b.Email = strings.ToLower(strings.TrimSpace(b.Email))
	if !strings.Contains(b.Email, "@") || len(b.Password) < 12 || len(b.Password) > 72 {
		return fiber.NewError(400, "Use a valid email and a password of 12–72 bytes")
	}
	var id int
	if register {
		hash, err := auth.HashPassword(b.Password)
		if err != nil {
			return err
		}
		tx, err := db.Pool.Begin(c.Context())
		if err != nil {
			return err
		}
		defer tx.Rollback(c.Context())
		err = tx.QueryRow(c.Context(), `INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id`, b.Email, hash).Scan(&id)
		if err != nil {
			return fiber.NewError(409, "Unable to register this email")
		}
		if strings.TrimSpace(b.Project) == "" {
			b.Project = "My workspace"
		}
		_, err = tx.Exec(c.Context(), `INSERT INTO projects(name,api_key,owner_id,telemetry_secret) VALUES($1,$2,$3,$4)`, b.Project, "ap_pub_"+auth.Credential(), id, auth.Credential())
		if err != nil {
			return err
		}
		if err = tx.Commit(c.Context()); err != nil {
			return err
		}
	} else {
		var hash string
		err := db.Pool.QueryRow(c.Context(), `SELECT id,password_hash FROM users WHERE email=$1`, b.Email).Scan(&id, &hash)
		if err != nil || !auth.CheckPassword(hash, b.Password) {
			return fiber.NewError(401, "Email or password is incorrect")
		}
	}
	token, err := auth.GenerateToken(id)
	if err != nil {
		return err
	}
	c.Cookie(&fiber.Cookie{Name: "token", Value: token, HTTPOnly: true, Secure: os.Getenv("APP_ENV") == "production", SameSite: "Strict", Path: "/", Expires: time.Now().Add(7 * 24 * time.Hour)})
	return c.JSON(fiber.Map{"authenticated": true})
}
func Logout(c *fiber.Ctx) error {
	c.Cookie(&fiber.Cookie{Name: "token", Value: "", HTTPOnly: true, Secure: os.Getenv("APP_ENV") == "production", SameSite: "Strict", Path: "/", Expires: time.Unix(1, 0)})
	return c.JSON(fiber.Map{"authenticated": false})
}

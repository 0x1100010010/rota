package repository

import (
	"context"
	"fmt"

	"github.com/alpkeskin/rota/core/internal/database"
	"github.com/alpkeskin/rota/core/internal/models"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

// UserRepository handles proxy_users database operations
type UserRepository struct {
	db *database.DB
}

// NewUserRepository creates a new UserRepository
func NewUserRepository(db *database.DB) *UserRepository {
	return &UserRepository{db: db}
}

// List returns all proxy users (passwords excluded)
func (r *UserRepository) List(ctx context.Context) ([]models.ProxyUser, error) {
	query := `
		SELECT pu.id, pu.username, pu.enabled,
		       COALESCE(pu.allow_working_proxies_export, false),
		       pu.main_pool_id, pu.fallback_pool_ids, pu.max_retries,
		       COALESCE(pu.requests_per_minute, 0),
		       pu.created_at, pu.updated_at,
		       COALESCE(pp.name, '') AS main_pool_name
		FROM proxy_users pu
		LEFT JOIN proxy_pools pp ON pp.id = pu.main_pool_id
		ORDER BY pu.created_at DESC
	`
	rows, err := r.db.Pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list users: %w", err)
	}
	defer rows.Close()

	var users []models.ProxyUser
	for rows.Next() {
		var u models.ProxyUser
		if err := rows.Scan(
			&u.ID, &u.Username, &u.Enabled, &u.AllowWorkingProxiesExport,
			&u.MainPoolID, &u.FallbackPoolIDs, &u.MaxRetries,
			&u.RequestsPerMinute,
			&u.CreatedAt, &u.UpdatedAt, &u.MainPoolName,
		); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		if u.FallbackPoolIDs == nil {
			u.FallbackPoolIDs = []int{}
		}
		users = append(users, u)
	}
	if users == nil {
		users = []models.ProxyUser{}
	}
	return users, nil
}

// GetByID returns a user by primary key (includes password_hash)
func (r *UserRepository) GetByID(ctx context.Context, id int) (*models.ProxyUser, error) {
	return r.scan(ctx, `SELECT id, username, password_hash, enabled,
		COALESCE(allow_working_proxies_export, false),
		main_pool_id, fallback_pool_ids, max_retries,
		COALESCE(requests_per_minute, 0),
		created_at, updated_at
		FROM proxy_users WHERE id = $1`, id)
}

// GetByUsername returns a user by username (includes password_hash — used for auth)
func (r *UserRepository) GetByUsername(ctx context.Context, username string) (*models.ProxyUser, error) {
	return r.scan(ctx, `SELECT id, username, password_hash, enabled,
		COALESCE(allow_working_proxies_export, false),
		main_pool_id, fallback_pool_ids, max_retries,
		COALESCE(requests_per_minute, 0),
		created_at, updated_at
		FROM proxy_users WHERE username = $1`, username)
}

func (r *UserRepository) scan(ctx context.Context, query string, arg interface{}) (*models.ProxyUser, error) {
	var u models.ProxyUser
	err := r.db.Pool.QueryRow(ctx, query, arg).Scan(
		&u.ID, &u.Username, &u.PasswordHash, &u.Enabled, &u.AllowWorkingProxiesExport,
		&u.MainPoolID, &u.FallbackPoolIDs, &u.MaxRetries,
		&u.RequestsPerMinute,
		&u.CreatedAt, &u.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("scan user: %w", err)
	}
	if u.FallbackPoolIDs == nil {
		u.FallbackPoolIDs = []int{}
	}
	return &u, nil
}

// Create inserts a new proxy user
func (r *UserRepository) Create(ctx context.Context, req models.CreateProxyUserRequest) (*models.ProxyUser, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	maxRetries := req.MaxRetries
	if maxRetries <= 0 {
		maxRetries = 5
	}
	fbIDs := req.FallbackPoolIDs
	if fbIDs == nil {
		fbIDs = []int{}
	}

	var u models.ProxyUser
	err = r.db.Pool.QueryRow(ctx, `
		INSERT INTO proxy_users (username, password_hash, enabled, allow_working_proxies_export, main_pool_id, fallback_pool_ids, max_retries, requests_per_minute)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, username, enabled, allow_working_proxies_export, main_pool_id, fallback_pool_ids, max_retries,
		          COALESCE(requests_per_minute, 0), created_at, updated_at
	`, req.Username, string(hash), req.Enabled, req.AllowWorkingProxiesExport, req.MainPoolID, fbIDs, maxRetries, req.RequestsPerMinute,
	).Scan(&u.ID, &u.Username, &u.Enabled, &u.AllowWorkingProxiesExport, &u.MainPoolID, &u.FallbackPoolIDs,
		&u.MaxRetries, &u.RequestsPerMinute, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	if u.FallbackPoolIDs == nil {
		u.FallbackPoolIDs = []int{}
	}
	return &u, nil
}

// Update modifies an existing user
func (r *UserRepository) Update(ctx context.Context, id int, req models.UpdateProxyUserRequest) (*models.ProxyUser, error) {
	current, err := r.GetByID(ctx, id)
	if err != nil || current == nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	enabled := current.Enabled
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	allowExport := current.AllowWorkingProxiesExport
	if req.AllowWorkingProxiesExport != nil {
		allowExport = *req.AllowWorkingProxiesExport
	}

	mainPoolID := current.MainPoolID
	if req.MainPoolID != nil {
		if *req.MainPoolID <= 0 {
			mainPoolID = nil
		} else {
			mainPoolID = req.MainPoolID
		}
	}

	fallbackPoolIDs := current.FallbackPoolIDs
	if req.FallbackPoolIDs != nil {
		fallbackPoolIDs = req.FallbackPoolIDs
	}

	maxRetries := current.MaxRetries
	if req.MaxRetries > 0 {
		maxRetries = req.MaxRetries
	}

	requestsPerMin := current.RequestsPerMinute
	if req.RequestsPerMinute != nil {
		requestsPerMin = *req.RequestsPerMinute
	}

	var hashPtr *string
	if req.Password != "" {
		h, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			return nil, fmt.Errorf("hash password: %w", err)
		}
		s := string(h)
		hashPtr = &s
	}

	var u models.ProxyUser
	err = r.db.Pool.QueryRow(ctx, `
		UPDATE proxy_users SET
			password_hash                = CASE WHEN $1::TEXT IS NOT NULL THEN $1 ELSE password_hash END,
			enabled                      = $2,
			allow_working_proxies_export = $3,
			main_pool_id                 = $4,
			fallback_pool_ids            = $5,
			max_retries                  = $6,
			requests_per_minute          = $7,
			updated_at                   = NOW()
		WHERE id = $8
		RETURNING id, username, enabled, allow_working_proxies_export, main_pool_id, fallback_pool_ids, max_retries,
		          COALESCE(requests_per_minute, 0), created_at, updated_at
	`, hashPtr, enabled, allowExport, mainPoolID, fallbackPoolIDs, maxRetries, requestsPerMin, id,
	).Scan(&u.ID, &u.Username, &u.Enabled, &u.AllowWorkingProxiesExport, &u.MainPoolID, &u.FallbackPoolIDs,
		&u.MaxRetries, &u.RequestsPerMinute, &u.CreatedAt, &u.UpdatedAt)

	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("update user: %w", err)
	}
	if u.FallbackPoolIDs == nil {
		u.FallbackPoolIDs = []int{}
	}
	return &u, nil
}

// Delete removes a user
func (r *UserRepository) Delete(ctx context.Context, id int) error {
	_, err := r.db.Pool.Exec(ctx, `DELETE FROM proxy_users WHERE id = $1`, id)
	return err
}

// Authenticate checks username/password and returns the user if valid.
func (r *UserRepository) Authenticate(ctx context.Context, username, password string) (*models.ProxyUser, error) {
	u, err := r.GetByUsername(ctx, username)
	if err != nil || u == nil {
		return nil, fmt.Errorf("user not found")
	}
	if !u.Enabled {
		return nil, fmt.Errorf("user disabled")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return nil, fmt.Errorf("invalid password")
	}
	return u, nil
}

FROM golang:1.23-alpine AS builder
RUN apk add --no-cache git
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /worker .

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /worker /worker
CMD ["/worker"]

package main

import (
	"errors"
	"fmt"
	"slices"
	"strings"
)

const command = "callmap-go"

var editorNames = []string{"vscode", "jetbrains"}

var usage = fmt.Sprintf(
	"usage: %s review [<repo>] [--base <commit>] [--scope <glob>]... [--out <file>] [--no-open] [--no-cache] [--editor %s] [--tests]",
	command, strings.Join(editorNames, "|"),
)

type invocation struct {
	repo   string
	base   string
	scope  []string
	out    string
	open   bool
	cache  bool
	editor string
	tests  bool
}

var valueFlags = []string{"--base", "--scope", "--out", "--editor"}

func readArguments(args []string, cwd string) (invocation, error) {
	read := invocation{scope: []string{}, open: true, cache: true, editor: "vscode"}
	if len(args) == 0 || args[0] != "review" {
		return read, errors.New(usage)
	}
	rest := args[1:]
	for index := 0; index < len(rest); index++ {
		argument := rest[index]
		switch {
		case argument == "--no-open":
			read.open = false
		case argument == "--no-cache":
			read.cache = false
		case argument == "--tests":
			read.tests = true
		case slices.Contains(valueFlags, argument):
			if index+1 >= len(rest) || strings.HasPrefix(rest[index+1], "--") {
				return read, fmt.Errorf("%s needs a value after it", argument)
			}
			value := rest[index+1]
			switch argument {
			case "--base":
				read.base = value
			case "--scope":
				read.scope = append(read.scope, value)
			case "--out":
				read.out = value
			default:
				if !slices.Contains(editorNames, value) {
					return read, fmt.Errorf("--editor needs one of %s after it", strings.Join(editorNames, ", "))
				}
				read.editor = value
			}
			index++
		case strings.HasPrefix(argument, "--"):
			return read, fmt.Errorf("%s is not a flag %s review knows", argument, command)
		case read.repo == "":
			read.repo = argument
		default:
			return read, fmt.Errorf("'%s' follows no flag. Callmap reviews one repo at a time.", argument)
		}
	}
	if read.repo == "" {
		read.repo = cwd
	}
	return read, nil
}

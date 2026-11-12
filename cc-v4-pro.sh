export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
export ANTHROPIC_MODEL=deepseek-v4-pro[1m]
export ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro[1m]
export ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-v4-pro[1m]
export ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-v4-flash
export CLAUDE_CODE_SUBAGENT_MODEL=deepseek-v4-pro
export CLAUDE_CODE_EFFORT_LEVEL=max

# Load DEEPSEEK_API_KEY from ~/.env
if [ -f ~/.env ]; then
  export $(grep DEEPSEEK_API_KEY ~/.env | xargs)
  export ANTHROPIC_AUTH_TOKEN=$DEEPSEEK_API_KEY
else
  echo "Error: ~/.env file not found"
  exit 1
fi

claude --dangerously-skip-permissions
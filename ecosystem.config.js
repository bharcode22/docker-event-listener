module.exports = {
    apps: [
        {
            name: 'docker-event-listener',
            script: 'src/main.ts',
            interpreter: 'node',
            exec_mode: 'fork',
            watch: true,
            ignore_watch: ['node_modules', 'dist'],
            env: {
                NODE_ENV: 'development'
            }
        }
    ]
};

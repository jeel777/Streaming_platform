import cluster from "node:cluster";
import os from "node:os";

const numCPUs = os.cpus().length;

if (cluster.isPrimary) {
    console.log(`[Cluster] Primary process ${process.pid} starting`);
    console.log(`[Cluster] Forking ${numCPUs} workers...\n`);

    // Fork one worker per CPU core
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    // Restart crashed workers
    cluster.on("exit", (worker, code, signal) => {
        console.warn(
            `[Cluster] Worker ${worker.process.pid} died ` +
            `(code: ${code}, signal: ${signal}). Restarting...`
        );
        cluster.fork();
    });

    // Log when workers come online
    cluster.on("online", (worker) => {
        console.log(`[Cluster] Worker ${worker.process.pid} online`);
    });
} else {
    // Workers run the actual Express server
    import("./index.js");
}

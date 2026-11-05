
pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    stages {

        stage('Source Checkout') {
            steps {
                echo 'Source code checked out by Jenkins SCM'
            }
        }

        stage('Prepare Environment') {
            steps {
                bat '''
                    if not exist .env (
                        if not exist .env.example (
                            echo ERROR: .env.example is missing
                            exit /b 1
                        )
                        copy .env.example .env
                    )
                '''
            }
        }

        stage('Configuration Validation') {
            steps {
                bat 'docker compose config -q'
                echo 'Docker Compose configuration is valid'
            }
        }

        stage('Build Docker Images') {
            steps {
                bat 'docker compose build'
            }
        }

        stage('Application Tests') {
            steps {
                dir('services/user-service') {
                    bat 'npm ci'
                    bat 'npm test --if-present'
                }

                dir('services/product-service') {
                    bat 'npm ci'
                    bat 'npm test --if-present'
                }

                dir('services/order-service') {
                    bat 'npm ci'
                    bat 'npm test --if-present'
                }
            }
        }
    }

    post {
        success {
            echo 'CI pipeline completed successfully!'
        }

        failure {
            echo 'CI pipeline failed. Check console output.'
        }

        always {
            echo 'Pipeline execution finished.'
        }
    }
}

pipeline{
    agent any
    
    options{
        timestamps()
        disableConcurrentBuilds()
    }

    stages{
        stage("Source Checkout"){
            steps{
                echo 'Checking out source code'
                checkout scm
            }
        }
        stage("Configuration Validation"){
            steps{
                bat 'docker compose config -q'
                echo 'Docker Compose configuration is valid'

            }
        }
        stage("Build Docker Images"){
            steps{
                bat 'docker compose build'

            }
        }
        stage("Application Tests"){
            steps{
                dir('services/user-service') {
                    bat 'npm test --if-present'
                }

                dir('services/product-service') {
                    bat 'npm test --if-present'
                }

                dir('services/order-service') {
                    bat 'npm test --if-present'
                }

                echo 'Available application tests completed'
                
            }
        }
    }
    post{
        success{
            echo "CI pipeline completed successfully..!"
        }
        failure {
            echo "CI pipeline faild, check console logs......"
        }
    }
}
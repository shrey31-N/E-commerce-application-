
pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    environment {
        AWS_REGION    = 'ap-southeast-2'
        AWS_ACCOUNT_ID = '507941515612'
        ECR_REGISTRY  = '507941515612.dkr.ecr.ap-southeast-2.amazonaws.com'
    }

    stages {

        stage('Source Checkout') {
            steps {
                checkout scm
                echo 'Source code checked out successfully.'
            }
        }

        stage('Set Release Version') {
            steps {
                script {
                    env.IMAGE_TAG = "build-${env.BUILD_NUMBER}"
                    echo "Building release: ${env.IMAGE_TAG}"
                }
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
                echo 'Docker Compose configuration is valid.'
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

        stage('Build Docker Images') {
            steps {
                bat '''
                    echo Building release %IMAGE_TAG%

                    docker compose build user-service product-service order-service frontend

                    if errorlevel 1 exit /b 1
                '''
            }
        }

        stage('Verify Docker Images') {
            steps {
                bat '''
                    docker image inspect %ECR_REGISTRY%/shopsphere-user:%IMAGE_TAG% >nul 2>&1
                    if errorlevel 1 exit /b 1

                    docker image inspect %ECR_REGISTRY%/shopsphere-product:%IMAGE_TAG% >nul 2>&1
                    if errorlevel 1 exit /b 1

                    docker image inspect %ECR_REGISTRY%/shopsphere-order:%IMAGE_TAG% >nul 2>&1
                    if errorlevel 1 exit /b 1

                    docker image inspect %ECR_REGISTRY%/shopsphere-frontend:%IMAGE_TAG% >nul 2>&1
                    if errorlevel 1 exit /b 1

                    echo All four Docker images verified successfully.
                '''
            }
        }

        stage('Authenticate and Push to ECR') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'aws-ecr-jenkins',
                        usernameVariable: 'AWS_ACCESS_KEY_ID',
                        passwordVariable: 'AWS_SECRET_ACCESS_KEY'
                    )
                ]) {
                    bat '''
                        aws --version

                        aws ecr get-login-password --region %AWS_REGION% | docker login --username AWS --password-stdin %ECR_REGISTRY%

                        if errorlevel 1 exit /b 1

                        docker push %ECR_REGISTRY%/shopsphere-user:%IMAGE_TAG%
                        if errorlevel 1 exit /b 1

                        docker push %ECR_REGISTRY%/shopsphere-product:%IMAGE_TAG%
                        if errorlevel 1 exit /b 1

                        docker push %ECR_REGISTRY%/shopsphere-order:%IMAGE_TAG%
                        if errorlevel 1 exit /b 1

                        docker push %ECR_REGISTRY%/shopsphere-frontend:%IMAGE_TAG%
                        if errorlevel 1 exit /b 1

                        echo All four images pushed successfully!
                    '''
                }
            }
        }
    }

    post {
        success {
            echo 'ShopSphere CI pipeline completed successfully!'
            echo "Published image version: ${env.IMAGE_TAG}"
        }

        failure {
            echo 'Pipeline failed. Check Jenkins Console Output.'
        }

        always {
            echo 'Pipeline execution finished.'
        }
    }
}
